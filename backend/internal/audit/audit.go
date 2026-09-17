package audit

import "time"

// Action constant identifiers for security and administrative events.
const (
	ActionAuthLoginSuccess      = "auth.login.success"
	ActionAuthLoginFailure      = "auth.login.failure"
	ActionAuthLoginLocked       = "auth.login.locked"
	ActionAuthLogout            = "auth.logout"
	ActionAuthPasswordChange    = "auth.password_change"
	ActionUserCreate            = "user.create"
	ActionUserBulkCreate        = "user.bulk_create"
	ActionUserBulkAction        = "user.bulk_action"
	ActionUserDelete            = "user.delete"
	ActionUserSuspend           = "user.suspend"
	ActionUserRestore           = "user.restore"
	ActionUserRoleUpdate        = "user.role_update"
	ActionUserResetPassword     = "user.reset_password"
	ActionContestStart          = "contest.start"
	ActionContestPause          = "contest.pause"
	ActionContestResume         = "contest.resume"
	ActionContestExtend         = "contest.extend"
	ActionContestFreeze         = "contest.freeze"
	ActionContestUnfreeze       = "contest.unfreeze"
	ActionContestReset          = "contest.reset"
	ActionContestEnd            = "contest.end"
	ActionContestSettingsUpdate = "contest.settings_update"
	ActionProblemCreate         = "problem.create"
	ActionProblemUpdate         = "problem.update"
	ActionProblemDelete         = "problem.delete"
	ActionProblemPublish        = "problem.publish"
	ActionProblemRejudge        = "problem.rejudge"
	ActionSubmissionRejudge     = "submission.rejudge"
	ActionSubmissionCancel      = "submission.cancel"
	ActionSubmissionReview      = "submission.review"
	ActionProctorRevoke         = "proctor.revoke"
	ActionProctorReadmit        = "proctor.readmit"
	ActionUserExemptionUpdate   = "user.exemption_update"
	ActionUserAccessUpdate      = "user.access_update"
	ActionTeamCreate            = "team.create"
	ActionTeamBulkCreate        = "team.bulk_create"
	ActionTeamUpdate            = "team.update"
	ActionTeamDelete            = "team.delete"
	ActionTeamMemberAdd         = "team.member_add"
	ActionTeamMemberRemove      = "team.member_remove"
)

// Status constants
const (
	StatusSuccess = "success"
	StatusFailure = "failure"
	StatusBlocked = "blocked"
	StatusLocked  = "locked"
)

// Target type constants
const (
	TargetAuth       = "auth"
	TargetUser       = "user"
	TargetTeam       = "team"
	TargetContest    = "contest"
	TargetProblem    = "problem"
	TargetSubmission = "submission"
	TargetProctor    = "proctor"
)

// LogEntry models an immutable audit event stored in PostgreSQL.
type LogEntry struct {
	ID            string                 `json:"id"`
	ActorID       string                 `json:"actorId,omitempty"`
	ActorUsername string                 `json:"actorUsername"`
	ActorRole     string                 `json:"actorRole"`
	Action        string                 `json:"action"`
	TargetType    string                 `json:"targetType"`
	TargetID      string                 `json:"targetId,omitempty"`
	Status        string                 `json:"status"`
	IPAddress     string                 `json:"ipAddress"`
	UserAgent     string                 `json:"userAgent"`
	Details       map[string]interface{} `json:"details"`
	CreatedAt     time.Time              `json:"createdAt"`
}

// FilterOptions specifies query criteria when retrieving audit logs.
type FilterOptions struct {
	Action        string
	Status        string
	ActorUsername string
	TargetType    string
	Limit         int
	Offset        int
}
