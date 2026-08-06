package proctor

import (
	"context"
	"time"
)

type Gate struct {
	repo *Repository
}

func NewGate(repo *Repository) *Gate {
	return &Gate{repo: repo}
}

func (g *Gate) Check(ctx context.Context, userID string) (GateStatus, error) {
	isExempt, lastPing, err := g.repo.GetUserProctorState(ctx, userID)
	if err != nil {
		return GateStatus{Allowed: false}, err
	}

	if isExempt {
		return GateStatus{
			Allowed: true,
			Exempt:  true,
		}, nil
	}

	if lastPing == nil {
		return GateStatus{
			Allowed:          false,
			Exempt:           false,
			SecondsSincePing: 999999,
		}, nil
	}

	elapsedSeconds := int(time.Since(*lastPing).Seconds())
	if elapsedSeconds > ProctorGateMaxStaleSeconds {
		return GateStatus{
			Allowed:          false,
			Exempt:           false,
			LastPingAt:       lastPing,
			SecondsSincePing: elapsedSeconds,
		}, nil
	}

	return GateStatus{
		Allowed:          true,
		Exempt:           false,
		LastPingAt:       lastPing,
		SecondsSincePing: elapsedSeconds,
	}, nil
}
