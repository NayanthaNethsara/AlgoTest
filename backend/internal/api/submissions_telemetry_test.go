package api

import (
	"strings"
	"testing"
)

func intPtr(val int) *int {
	return &val
}

func TestEvaluateSubmissionTelemetry(t *testing.T) {
	code500 := strings.Repeat("x = x + 1;\n", 50)

	cases := []struct {
		name       string
		code       string
		req        createSubmissionRequest
		wantFlag   bool
		isDirectAPI bool
	}{
		{
			name: "short code under threshold is not flagged",
			code: "print('hello')",
			req: createSubmissionRequest{
				PastedChars: intPtr(100),
				TypedCount:  intPtr(0),
			},
			wantFlag: false,
		},
		{
			name: "monitored typing cadence is not flagged",
			code: code500,
			req: createSubmissionRequest{
				PastedChars: intPtr(0),
				TypedCount:  intPtr(450),
			},
			wantFlag: false,
		},
		{
			name: "monitored editor paste burst is flagged",
			code: code500,
			req: createSubmissionRequest{
				PastedChars:  intPtr(500),
				TypedCount:   intPtr(5),
				PasteCount:   intPtr(1),
				MaxPasteSize: intPtr(500),
			},
			wantFlag: true,
		},
		{
			name: "unmonitored submission with omitted telemetry is flagged",
			code: code500,
			req: createSubmissionRequest{
				PastedChars: nil,
				TypedCount:  nil,
			},
			wantFlag:    true,
			isDirectAPI: true,
		},
		{
			name: "zeroed telemetry spoofing is flagged",
			code: code500,
			req: createSubmissionRequest{
				PastedChars: intPtr(0),
				TypedCount:  intPtr(0),
			},
			wantFlag: true,
		},
		{
			name: "underreported paste with large unaccounted gap is flagged",
			code: code500,
			req: createSubmissionRequest{
				PastedChars: intPtr(0),
				TypedCount:  intPtr(10),
			},
			wantFlag: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flagged, evidence := evaluateSubmissionTelemetry(tc.code, tc.req)
			if flagged != tc.wantFlag {
				t.Fatalf("evaluateSubmissionTelemetry() flagged = %v, want %v", flagged, tc.wantFlag)
			}
			if tc.wantFlag {
				if evidence == nil {
					t.Fatal("expected evidence map, got nil")
				}
				if tc.isDirectAPI {
					unmonitored, ok := evidence["unmonitored_api"].(bool)
					if !ok || !unmonitored {
						t.Errorf("expected unmonitored_api to be true, got %v", evidence["unmonitored_api"])
					}
				}
			}
		})
	}
}
