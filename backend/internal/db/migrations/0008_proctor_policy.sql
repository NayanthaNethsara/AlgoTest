-- +goose Up

-- Agent policy moves into contest_settings rather than a table of its own, and
-- deliberately so: Settings already reloads that whole table on one query every
-- 30s, so the policy rides along at zero additional query cost and organizers get
-- live edits without the ingest path ever touching the database for it.
--
-- Denylists are comma-separated. Blanks are trimmed and dropped on read, and any
-- key that is absent, empty or unparseable falls back to the compiled-in default
-- rather than to nothing — an empty denylist would silently disable detection.
INSERT INTO contest_settings (key, value) VALUES
    ('proctor.heartbeat_seconds', '15'),
    ('proctor.port_probe_seconds', '60'),
    ('proctor.keepalive_seconds', '300'),
    ('proctor.rules_refresh_seconds', '300'),
    ('proctor.gate_max_stale_seconds', '90'),
    -- Kept in step with DefaultPolicy, and asserted by
    -- TestMigrationSeedMatchesDefaultPolicy so the two copies cannot drift.
    --
    -- Terms match as whole words against the tokenized process name and command
    -- line, so 'ollama' still hits /usr/local/bin/ollama and ollama.exe but 'jan'
    -- no longer hits /home/janith. A term containing a space, dot or dash must
    -- appear as a contiguous run: 'tabby serve' names TabbyML's invocation and
    -- cannot match the unrelated Tabby terminal emulator. Prefer that shape over a
    -- bare word whenever a term is also an ordinary English word.
    ('proctor.process_denylist',
     'ollama,lmstudio,lm studio,jan,gpt4all,llama-server,llama.cpp,vllm,koboldcpp,localai,text-generation-webui,tabby serve,gpt4all-chat'),
    ('proctor.foreground_denylist',
     'ai.ollama,com.ollama,lmstudio,ai.jan,com.gpt4all,koboldcpp')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM contest_settings WHERE key LIKE 'proctor.%';
