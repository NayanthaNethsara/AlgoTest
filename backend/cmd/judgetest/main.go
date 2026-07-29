// Command judgetest is an abuse + load harness for the /api/v1/run sandbox.
// It proves the event-critical guarantees on a live server -- fair CPU limit,
// wall-clock backstop, no sandbox escape, no host impact, and controlled
// overflow under a deadline-style burst -- and exits non-zero if any check
// fails, so it can gate a deployment.
//
// Usage:
//
//	go run ./cmd/judgetest -url http://localhost:8080 -username alice -password secret
//	go run ./cmd/judgetest -burst 500          # crank concurrency on the real box
//	go run ./cmd/judgetest -skip-load          # abuse cases only
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type runResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	TimeMs   int64  `json:"timeMs"`
	MemoryKB int64  `json:"memoryKb"`
	Verdict  string `json:"verdict"`
}

type client struct {
	base  string
	token string
	http  *http.Client
}

func main() {
	var (
		base     = flag.String("url", "http://localhost:8080", "backend base URL")
		username = flag.String("username", "testrunner", "login username")
		password = flag.String("password", "", "login password (required unless -token)")
		token    = flag.String("token", "", "existing session token (skips login)")
		burst    = flag.Int("burst", 100, "concurrent requests for the load test")
		skipLoad = flag.Bool("skip-load", false, "run only the abuse cases")
	)
	flag.Parse()

	c := &client{base: strings.TrimRight(*base, "/"), http: &http.Client{Timeout: 60 * time.Second}}

	if *token != "" {
		c.token = *token
	} else {
		if *password == "" {
			fatal("provide -password (or -token)")
		}
		if err := c.login(*username, *password); err != nil {
			fatal("login failed: %v", err)
		}
	}

	if !c.healthy() {
		fatal("server is not healthy before tests -- aborting")
	}

	r := &report{}
	runAbuseCases(c, r)
	if !*skipLoad {
		runLoadTest(c, *burst, r)
	}

	// The host must be fine after everything we threw at it.
	r.check("host healthy after suite", c.healthy(), "healthz did not return ok")

	r.summarize()
	if r.failed > 0 {
		os.Exit(1)
	}
}

// ---- abuse cases -----------------------------------------------------------

func runAbuseCases(c *client, r *report) {
	fmt.Println("== abuse / guardrail cases ==")

	// 1. Correct program runs and produces the right answer.
	res, _, err := c.run("cpp", `#include <bits/stdc++.h>
using namespace std;
int main(){int a,b;cin>>a>>b;cout<<a+b<<"\n";}`, "3 4")
	r.check("correct program: exit 0 + right output", err == nil && res.ExitCode == 0 && strings.TrimSpace(res.Stdout) == "7",
		fmt.Sprintf("got %+v err=%v", res, err))

	// 2. CPU-bound infinite loop is killed by the CPU limit.
	res, _, err = c.run("python", "x=0\nwhile True:\n  x+=1", "")
	r.check("cpu loop: TLE via CPU limit", err == nil && res.Verdict == "TLE" && strings.Contains(res.Stderr, "time limit"),
		fmt.Sprintf("got %+v err=%v", res, err))

	// 3. Sleeping burns no CPU (CPU time ~0ms), caught by wall-clock backstop.
	res, _, err = c.run("python", "import time\ntime.sleep(60)", "")
	r.check("sleep loop: caught by wall backstop (verdict TLE)", err == nil && res.Verdict == "TLE",
		fmt.Sprintf("got %+v err=%v", res, err))

	// 4. Fork bomb is contained by --pids-limit; must not hang or take the host.
	res, status, err := c.run("python", "import os\nwhile True:\n  os.fork()", "")
	r.check("fork bomb: contained, returns cleanly", err == nil && status == 200,
		fmt.Sprintf("status=%d res=%+v err=%v", status, res, err))

	// 5. Memory hog exceeds the 256m cap -> OOM/MemoryError, never succeeds.
	res, _, err = c.run("python", "b = bytearray(1024*1024*1024)\nprint('ALLOCATED', len(b))", "")
	r.check("memory hog: denied (no successful 1GB alloc)", err == nil && !strings.Contains(res.Stdout, "ALLOCATED"),
		fmt.Sprintf("got %+v err=%v", res, err))

	// 6. Network is --network none: no DNS, no egress.
	res, _, err = c.run("python", `import urllib.request
try:
    urllib.request.urlopen("http://example.com", timeout=3)
    print("REACHED_INTERNET")
except Exception as e:
    print("blocked")`, "")
	r.check("network escape: blocked", err == nil && strings.Contains(res.Stdout, "blocked") && !strings.Contains(res.Stdout, "REACHED_INTERNET"),
		fmt.Sprintf("got %+v err=%v", res, err))

	// 7. Root filesystem is read-only: cannot tamper with the container image.
	res, _, err = c.run("python", `try:
    open("/etc/passwd", "a").write("x")
    print("WROTE_ROOTFS")
except Exception:
    print("readonly")`, "")
	r.check("rootfs write: denied (read-only)", err == nil && strings.Contains(res.Stdout, "readonly") && !strings.Contains(res.Stdout, "WROTE_ROOTFS"),
		fmt.Sprintf("got %+v err=%v", res, err))

	// 8. Compile errors surface as a non-zero exit with stderr.
	res, _, err = c.run("cpp", "int main(){ this is not c++ }", "")
	r.check("compile error: surfaced", err == nil && res.ExitCode != 0 && res.Stderr != "",
		fmt.Sprintf("got %+v err=%v", res, err))

	// 9. Runaway output is truncated, never OOMs the backend buffer.
	res, _, err = c.run("python", "print('A' * 10_000_000)", "")
	r.check("output flood: truncated", err == nil && strings.Contains(res.Stdout, "(truncated)"),
		fmt.Sprintf("stdout_len=%d err=%v", len(res.Stdout), err))
}

// ---- load test -------------------------------------------------------------

func runLoadTest(c *client, n int, r *report) {
	fmt.Printf("\n== load test: %d concurrent runs ==\n", n)

	var ok, busy, bad int64
	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, status, err := c.run("python", "print(sum(range(1000)))", "")
			switch {
			case err == nil && status == 200 && res.ExitCode == 0 && strings.TrimSpace(res.Stdout) == "499500":
				atomic.AddInt64(&ok, 1)
			case status == 503:
				atomic.AddInt64(&busy, 1) // controlled overflow -> client retries; not a drop
			default:
				atomic.AddInt64(&bad, 1)
				fmt.Printf("  unexpected: status=%d res=%+v err=%v\n", status, res, err)
			}
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)

	fmt.Printf("  ok=%d  busy/503=%d  bad=%d  in %s\n", ok, busy, bad, elapsed.Round(time.Millisecond))
	// "No dropping" means every request got a definite answer: a correct 200 or
	// a clean 503 to retry -- never a hang, crash, or malformed 5xx.
	r.check("load: no unexpected failures (only 200 or 503)", bad == 0,
		fmt.Sprintf("%d requests neither succeeded nor got a clean 503", bad))
	r.check("load: at least some requests succeeded", ok > 0, "zero successful runs under load")
}

// ---- http helpers ----------------------------------------------------------

func (c *client) login(username, password string) error {
	body, _ := json.Marshal(map[string]string{"username": username, "password": password})
	resp, err := c.http.Post(c.base+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var out struct {
		SessionToken string `json:"sessionToken"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return err
	}
	if out.SessionToken == "" {
		return fmt.Errorf("no session token in response")
	}
	c.token = out.SessionToken
	return nil
}

// run posts to /api/v1/run and returns the parsed result and HTTP status. A
// non-200 status yields a zero result (the body is an error envelope, not a
// runResult) so callers branch on status.
func (c *client) run(language, code, stdin string) (runResult, int, error) {
	body, _ := json.Marshal(map[string]string{"language": language, "code": code, "stdin": stdin})
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, c.base+"/api/v1/run", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return runResult{}, 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return runResult{}, resp.StatusCode, nil
	}
	var res runResult
	if err := json.Unmarshal(raw, &res); err != nil {
		return runResult{}, resp.StatusCode, fmt.Errorf("bad json: %w (%s)", err, raw)
	}
	return res, resp.StatusCode, nil
}

func (c *client) healthy() bool {
	resp, err := c.http.Get(c.base + "/healthz")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// ---- reporting -------------------------------------------------------------

type report struct {
	passed int
	failed int
}

func (r *report) check(name string, ok bool, detail string) {
	if ok {
		r.passed++
		fmt.Printf("  ✓ %s\n", name)
		return
	}
	r.failed++
	fmt.Printf("  ✗ %s\n      %s\n", name, detail)
}

func (r *report) summarize() {
	fmt.Printf("\n== summary: %d passed, %d failed ==\n", r.passed, r.failed)
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "judgetest: "+format+"\n", args...)
	os.Exit(2)
}
