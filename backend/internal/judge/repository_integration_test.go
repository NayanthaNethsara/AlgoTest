package judge

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/NayanthaNethsara/labyrithm/backend/internal/db"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/problem"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/team"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresSubmissionLifecycle(t *testing.T) {
	dsn := os.Getenv("JUDGE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set JUDGE_TEST_DATABASE_URL to a disposable local PostgreSQL database")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
		t.Fatal("integration tests require a local database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := "judge_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		if _, err := admin.Exec(cleanup, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	if err := db.Migrate(u.String()); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewRepository(pool)
	exec := func(t *testing.T, sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	fixture := func(t *testing.T) Submission {
		t.Helper()
		s := Submission{ID: uuid.NewString(), TeamID: uuid.NewString(), UserID: uuid.NewString(), ProblemID: uuid.NewString(), MaxScore: 100, TestsTotal: 1}
		exec(t, `INSERT INTO teams(id,name) VALUES($1::uuid,$1::text);`, s.TeamID)
		exec(t, `INSERT INTO users(id,username,display_name,password_hash,team_id) VALUES($1::uuid,$1::text,'test','unused',$2);`, s.UserID, s.TeamID)
		exec(t, `INSERT INTO problems(id,slug,title,difficulty,statement,max_score,published) VALUES($1::uuid,$1::text,'test','easy','test',100,true);`, s.ProblemID)
		return s
	}
	insert := func(t *testing.T, s Submission, score int) {
		t.Helper()
		exec(t, `INSERT INTO submissions(id,team_id,user_id,problem_id,language,code,state,score,max_score,tests_total,finished_at,created_at)
		VALUES($1,$2,$3,$4,'cpp','test','passed',$5,100,1,NOW(),NOW()-INTERVAL '1 hour');`, s.ID, s.TeamID, s.UserID, s.ProblemID, score)
	}
	best := func(t *testing.T, s Submission, want int) {
		t.Helper()
		var score int
		if err := pool.QueryRow(ctx, `SELECT COALESCE((SELECT best_score FROM problem_scores WHERE team_id=$1 AND problem_id=$2),0);`, s.TeamID, s.ProblemID).Scan(&score); err != nil {
			t.Fatal(err)
		}
		if score != want {
			t.Fatalf("best score = %d, want %d", score, want)
		}
	}

	t.Run("concurrent scoring and review", func(t *testing.T) {
		s := fixture(t)
		insert(t, s, 0)
		other := s
		other.ID = uuid.NewString()
		insert(t, other, 0)
		first, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer first.Rollback(ctx)
		second, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer second.Rollback(ctx)
		if _, err := first.Exec(ctx, `UPDATE submissions SET score=100 WHERE id=$1;`, s.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := second.Exec(ctx, `UPDATE submissions SET score=40 WHERE id=$1;`, other.ID); err != nil {
			t.Fatal(err)
		}
		if err := recomputeProblemScore(ctx, first, s.TeamID, s.ProblemID); err != nil {
			t.Fatal(err)
		}
		pid := second.Conn().PgConn().PID()
		done := make(chan error, 1)
		go func() {
			err := recomputeProblemScore(ctx, second, s.TeamID, s.ProblemID)
			if err == nil {
				err = second.Commit(ctx)
			}
			done <- err
		}()
		for {
			var waiting bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted);`, pid).Scan(&waiting); err != nil {
				t.Fatal(err)
			}
			if waiting {
				break
			}
			select {
			case err := <-done:
				t.Fatalf("score calculation did not wait: %v", err)
			case <-time.After(time.Millisecond):
			}
		}
		if err := first.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		best(t, s, 100)
		if _, err := repo.ReviewSubmission(ctx, s.ID, "", ReviewRejected, "test"); err != nil {
			t.Fatal(err)
		}
		best(t, s, 40)
		if _, err := repo.ReviewSubmission(ctx, s.ID, "", ReviewAccepted, "test"); err != nil {
			t.Fatal(err)
		}
		best(t, s, 100)
	})

	t.Run("rejudge clears details and empty completion updates totals", func(t *testing.T) {
		s := fixture(t)
		insert(t, s, 100)
		exec(t, `INSERT INTO submission_tests(submission_id,ordinal,verdict,time_ms,memory_kb,points,max_points) VALUES($1,1,'AC',1,1,100,100);`, s.ID)
		if err := repo.RejudgeSubmission(ctx, s.ID); err != nil {
			t.Fatal(err)
		}
		result, _, err := repo.GetSubmission(ctx, s.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Tests) != 0 || result.Status != StatusQueued {
			t.Fatalf("stale rejudge: %+v", result)
		}
		best(t, s, 0)
		exec(t, `UPDATE submissions SET state='running',claimed_by='test',claimed_at=NOW(),lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1;`, s.ID)
		exec(t, `INSERT INTO submission_tests(submission_id,ordinal,verdict,time_ms,memory_kb) VALUES($1,1,'AC',1,1);`, s.ID)
		res := newResult(s, StatusFailed, "CE")
		res.TestsTotal = 3
		if err := repo.CompleteSubmission(ctx, res, "test"); err != nil {
			t.Fatal(err)
		}
		result, _, err = repo.GetSubmission(ctx, s.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Tests) != 0 || result.TestsTotal != 3 {
			t.Fatalf("stale completion: %+v", result)
		}
		if err := repo.CancelSubmission(ctx, s.ID); !errors.Is(err, ErrSubmissionNotActive) {
			t.Fatalf("cancel completed: %v", err)
		}
		if err := repo.CompleteSubmission(ctx, res, "test"); !errors.Is(err, ErrLeaseLost) {
			t.Fatalf("late completion: %v", err)
		}
	})

	t.Run("freeze uses submission time and corrected scores", func(t *testing.T) {
		s := fixture(t)
		insert(t, s, 40)
		cutoff := time.Now().Add(-30 * time.Minute)
		board, err := team.NewRepository(pool).GetLeaderboardWithCutoff(ctx, &cutoff)
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range board {
			if entry.TeamID == s.TeamID && (entry.TotalScore != 40 || entry.ProblemsSolved != 0) {
				t.Fatalf("frozen partial: %+v", entry)
			}
		}
		exec(t, `UPDATE submissions SET score=100,finished_at=NOW() WHERE id=$1;`, s.ID)
		board, err = team.NewRepository(pool).GetLeaderboardWithCutoff(ctx, &cutoff)
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range board {
			if entry.TeamID == s.TeamID && (entry.TotalScore != 100 || entry.ProblemsSolved != 1) {
				t.Fatalf("frozen corrected: %+v", entry)
			}
		}
	})

	t.Run("lease exhaustion and administrative revocation", func(t *testing.T) {
		s := fixture(t)
		insert(t, s, 100)
		if err := repo.RejudgeSubmission(ctx, s.ID); err != nil {
			t.Fatal(err)
		}
		for attempt := 1; attempt <= 3; attempt++ {
			claim := uuid.NewString()
			claimed, err := repo.ClaimNextSubmission(ctx, claim)
			if err != nil {
				t.Fatal(err)
			}
			if claimed.ID != s.ID || claimed.AttemptStartedAt == nil {
				t.Fatalf("incorrect claim: %+v", claimed)
			}
			exec(t, `UPDATE submissions SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1;`, s.ID)
			if err := repo.RenewLease(ctx, s.ID, claim); !errors.Is(err, ErrLeaseLost) {
				t.Fatalf("expired lease renewed: %v", err)
			}
			if _, err := repo.ReclaimExpiredLeases(ctx, nil); err != nil {
				t.Fatal(err)
			}
			result, _, err := repo.GetSubmission(ctx, s.ID)
			if err != nil {
				t.Fatal(err)
			}
			want := StatusQueued
			if attempt == 3 {
				want = StatusFailed
			}
			if result.Status != want {
				t.Fatalf("attempt %d: state %s, want %s", attempt, result.Status, want)
			}
		}
		best(t, s, 0)
		for _, unstick := range []bool{false, true} {
			if err := repo.RejudgeSubmission(ctx, s.ID); err != nil {
				t.Fatal(err)
			}
			claim := uuid.NewString()
			if _, err := repo.ClaimNextSubmission(ctx, claim); err != nil {
				t.Fatal(err)
			}
			var err error
			if unstick {
				err = repo.UnstickTeamSubmissions(ctx, s.TeamID)
			} else {
				err = repo.CancelSubmission(ctx, s.ID)
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := repo.CompleteSubmission(ctx, newResult(s, StatusPassed, "AC"), claim); !errors.Is(err, ErrLeaseLost) {
				t.Fatalf("revoked worker completed: %v", err)
			}
		}
	})

	t.Run("unpublished problems and zero point tests", func(t *testing.T) {
		s := fixture(t)
		exec(t, `UPDATE problems SET published=false,max_score=2 WHERE id=$1;`, s.ProblemID)
		tests := []problem.TestInput{{Input: []byte("a"), Expected: []byte("a")}, {Input: []byte("b"), Expected: []byte("b")}, {Input: []byte("c"), Expected: []byte("c")}}
		if err := problem.NewRepository(pool).ReplaceTests(ctx, s.ProblemID, tests); err != nil {
			t.Fatal(err)
		}
		var sum int
		if err := pool.QueryRow(ctx, `SELECT SUM(points) FROM problem_tests WHERE problem_id=$1;`, s.ProblemID).Scan(&sum); err != nil {
			t.Fatal(err)
		}
		if sum != 2 {
			t.Fatalf("points inflated to %d", sum)
		}
		if _, err := repo.CreateSubmission(ctx, s); !errors.Is(err, ErrProblemNotFound) {
			t.Fatalf("unpublished submission: %v", err)
		}
	})
}
