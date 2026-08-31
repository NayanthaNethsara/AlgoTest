-- +goose Up

-- 1. Insert new AI and foreground enforcement rules into proctor_rules
-- ai.ext.detected is informational (weight 0) so passive installed extensions are not penalized
INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('ai.ext.detected', 'EXTENSION', 'AI Editor Extension Installed', 'Informational: AI assistant extension installed in editor directory', 0, true),
    ('ai.proc.cloud_agent', 'PROCESS', 'Cloud AI Assistant Process', 'Running process or CLI tool for cloud AI (e.g. copilot-agent, cursor, claude)', 35, true),
    ('app.unauthorized_foreground', 'FOREGROUND', 'Unauthorized Foreground Application', 'Focused application outside the allowed development tools allowlist', 25, true),
    ('ai.code.paste_burst', 'INTEGRITY', 'Abnormal Code Paste Burst', 'Large code segment pasted from external source with minimal typing cadence', 20, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Update contest_settings with expanded cloud AI denylists and foreground allowlist
UPDATE contest_settings
SET value = 'ollama,lmstudio,lm studio,jan,gpt4all,llama-server,llama.cpp,vllm,koboldcpp,localai,text-generation-webui,tabby serve,gpt4all-chat,copilot-agent,copilot-language-server,github.copilot,codeium-lsp,tabnine,tabnine-deep-local,continue.continue,supermaven,cursor,windsurf,trae,pearai,void-editor,claude,aider,copilot,sgpt,interpreter,open-interpreter,cody,goose,llm,gemini-cli,amp,qodo,antigravity,antigravity-ide'
WHERE key = 'proctor.process_denylist';

UPDATE contest_settings
SET value = 'ai.ollama,com.ollama,lmstudio,ai.jan,com.gpt4all,koboldcpp,com.todesktop.230313mzl4w4u92,com.exafunction.windsurf,cursor,windsurf,trae,pearai,com.google.antigravity-ide,antigravity'
WHERE key = 'proctor.foreground_denylist';

INSERT INTO contest_settings (key, value) VALUES
    ('proctor.foreground_allowlist',
     'com.google.chrome,chrome,google-chrome,org.mozilla.firefox,firefox,com.apple.safari,safari,com.microsoft.edgemac,msedge,edge,com.brave.browser,brave,com.microsoft.vscode,code,com.microsoft.vscodeinsiders,vscodium,codium,com.jetbrains.intellij,idea,com.jetbrains.pycharm,pycharm,com.jetbrains.clion,clion,com.jetbrains.webstorm,webstorm,com.jetbrains.goland,goland,com.jetbrains.rider,rider,com.apple.dt.xcode,xcode,devenv,visual studio,com.sublimetext.4,com.sublimetext.3,sublime_text,sublime,nvim,neovim,vim,emacs,eclipse,codeblocks,geany,notepad++,kate,com.apple.terminal,terminal,com.googlecode.iterm2,iterm,iterm2,windowsterminal,cmd,powershell,pwsh,alacritty,kitty,wezterm,warp,mini-algothon-competitor,com.minialgothon.competitor,app,com.apple.finder,finder,explorer,systemsettings,com.apple.systempreferences')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- +goose Down
DELETE FROM proctor_rules WHERE id IN ('ai.ext.detected', 'ai.proc.cloud_agent', 'app.unauthorized_foreground', 'ai.code.paste_burst');
DELETE FROM contest_settings WHERE key = 'proctor.foreground_allowlist';
