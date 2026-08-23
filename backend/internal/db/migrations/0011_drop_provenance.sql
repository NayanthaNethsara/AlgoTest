-- +goose Up

-- Paste detection is gone: pasting is expected of contestants, so measuring it was
-- evidence nobody was going to act on. The table never held a row -- the editor hook
-- that fed it was never wired to the submit path -- so this drops an empty table and
-- a rule that could not fire.

DROP TABLE IF EXISTS submission_provenance;

DELETE FROM proctor_rules WHERE id = 'prov.paste_dominant';

-- +goose Down

CREATE TABLE IF NOT EXISTS submission_provenance (
    submission_id       UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    typed_chars         INT NOT NULL DEFAULT 0,
    pasted_chars        INT NOT NULL DEFAULT 0,
    bulk_inserted_chars INT NOT NULL DEFAULT 0,
    paste_count         INT NOT NULL DEFAULT 0,
    largest_paste       INT NOT NULL DEFAULT 0,
    external_edits      INT NOT NULL DEFAULT 0,
    ms_to_first_input   INT NOT NULL DEFAULT 0,
    ms_since_last_paste INT NOT NULL DEFAULT 0,
    timeline_buckets    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('prov.paste_dominant', 'PROVENANCE', 'Paste Dominant Solution', 'Code submission contains predominantly pasted characters', 10, true)
ON CONFLICT (id) DO NOTHING;
