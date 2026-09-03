-- +goose Up
-- Migration 0017: Expand process and foreground denylists with recent AI coding tools (cline, roo-cline, chatbox, cherry-studio, open-webui)

UPDATE contest_settings
SET value = 'ollama,lmstudio,lm studio,jan,gpt4all,llama-server,llama.cpp,vllm,koboldcpp,localai,text-generation-webui,tabby serve,gpt4all-chat,copilot-agent,copilot-language-server,github.copilot,codeium-lsp,tabnine,tabnine-deep-local,continue.continue,supermaven,cursor,windsurf,trae,pearai,void-editor,claude,aider,copilot,sgpt,interpreter,open-interpreter,cody,goose,llm,gemini-cli,amp,qodo,antigravity,antigravity-ide,cline,roo-cline,roocode,open-webui,chatbox,cherry-studio'
WHERE key = 'proctor.process_denylist';

UPDATE contest_settings
SET value = 'ai.ollama,com.ollama,lmstudio,ai.jan,com.gpt4all,koboldcpp,com.todesktop.230313mzl4w4u92,com.exafunction.windsurf,cursor,windsurf,trae,pearai,com.google.antigravity-ide,antigravity,chatbox,cherry-studio'
WHERE key = 'proctor.foreground_denylist';

-- +goose Down
-- Revert to previous list
UPDATE contest_settings
SET value = 'ollama,lmstudio,lm studio,jan,gpt4all,llama-server,llama.cpp,vllm,koboldcpp,localai,text-generation-webui,tabby serve,gpt4all-chat,copilot-agent,copilot-language-server,github.copilot,codeium-lsp,tabnine,tabnine-deep-local,continue.continue,supermaven,cursor,windsurf,trae,pearai,void-editor,claude,aider,copilot,sgpt,interpreter,open-interpreter,cody,goose,llm,gemini-cli,amp,qodo,antigravity,antigravity-ide'
WHERE key = 'proctor.process_denylist';
