package runner

import (
	"bufio"
	"errors"
	"os"
	"strconv"
	"strings"
)

// isolate status codes reported in the meta file. An empty status means the
// program ran to completion with exit code 0.
const (
	statusRuntimeError = "RE" // exited non-zero
	statusSignalled    = "SG" // died on a signal
	statusTimedOut     = "TO" // hit --time (+ --extra-time) or --wall-time
	statusInternal     = "XX" // isolate itself failed
)

// meta is the outcome isolate writes to its --meta file. It replaces the
// guesswork the Docker path needed (inferring a CPU kill from exit code
// 128+SIGXCPU): status says outright how the program ended.
type meta struct {
	status      string
	message     string
	exitCode    int
	exitSig     int
	timeCPU     float64 // CPU seconds
	timeWall    float64 // Wall seconds
	cgMemKB     int64   // Peak cgroup memory in KB
	maxRSSKB    int64   // Peak resident set size in KB
	cgOOMKilled bool
}

// memoryKB reports the larger of the two figures isolate gives: cg-mem sums
// every process but misses pages charged to the compile, max-rss includes those
// but does not sum across processes.
func (m meta) memoryKB() int64 {
	if m.maxRSSKB > m.cgMemKB {
		return m.maxRSSKB
	}
	return m.cgMemKB
}

// exitCodeOrSignal reports the exit code the way `docker run` did, so callers
// (and the API contract) keep seeing 128+signal for signal deaths.
func (m meta) exitCodeOrSignal() int {
	if m.status == statusSignalled && m.exitSig > 0 {
		return 128 + m.exitSig
	}
	return m.exitCode
}

func (m meta) verdict(memLimitKB int64) Verdict {
	if m.cgOOMKilled {
		return VerdictMLE
	}
	if m.status == statusTimedOut {
		return VerdictTLE
	}
	if (m.status == statusSignalled && (m.exitSig == 24 || m.exitSig == 9)) || m.exitCode == 128+24 || m.exitCode == 128+9 {
		return VerdictTLE
	}
	msgLower := strings.ToLower(m.message)
	if strings.Contains(msgLower, "time limit") || strings.Contains(msgLower, "timed out") || strings.Contains(msgLower, "wall clock") {
		return VerdictTLE
	}
	if m.status == statusInternal {
		return VerdictIE
	}
	if (m.status == statusSignalled && m.exitSig == 25) || m.exitCode == 128+25 {
		return VerdictOLE
	}
	if m.status == statusSignalled || m.status == statusRuntimeError || m.exitCode != 0 {
		if memLimitKB > 0 && m.memoryKB() >= int64(float64(memLimitKB)*0.95) {
			return VerdictMLE
		}
		return VerdictRTE
	}
	return VerdictAC
}

// errEmptyMeta means isolate was killed before it could report. A zero-valued
// meta has an empty status, which verdict() would read as success.
var errEmptyMeta = errors.New("meta file has no fields")

func metaWritten(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.Size() > 0
}

// parseMeta reads isolate's meta file, a flat "key:value" listing. Unknown keys
// are ignored so a newer isolate adding fields doesn't break us.
func parseMeta(path string) (meta, error) {
	f, err := os.Open(path)
	if err != nil {
		return meta{}, err
	}
	defer f.Close()

	fields := 0
	var m meta
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		key, value, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		fields++
		switch key {
		case "status":
			m.status = value
		case "message":
			m.message = value
		case "exitcode":
			if val, err := strconv.Atoi(value); err == nil {
				m.exitCode = val
			}
		case "exitsig":
			if val, err := strconv.Atoi(value); err == nil {
				m.exitSig = val
			}
		case "time":
			if val, err := strconv.ParseFloat(value, 64); err == nil {
				m.timeCPU = val
			}
		case "time-wall":
			if val, err := strconv.ParseFloat(value, 64); err == nil {
				m.timeWall = val
			}
		case "cg-mem":
			if val, err := strconv.ParseInt(value, 10, 64); err == nil {
				m.cgMemKB = val
			}
		case "max-rss":
			if val, err := strconv.ParseInt(value, 10, 64); err == nil {
				m.maxRSSKB = val
			}
		case "cg-oom-killed":
			m.cgOOMKilled = value == "1"
		}
	}
	if err := sc.Err(); err != nil {
		return meta{}, err
	}
	if fields == 0 {
		return meta{}, errEmptyMeta
	}
	return m, nil
}
