pub fn injected_lockdown_script(os_name: &str) -> String {
    format!(
        r#"
        document.cookie = "mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";
        window.__MINIALGOTHON_DESKTOP__ = true;
        window.__MINIALGOTHON_OS__ = "{os_name}";

        (function() {{
            var style = document.createElement('style');
            style.textContent = 'html, body {{ overscroll-behavior: none !important; overscroll-behavior-y: none !important; overscroll-behavior-x: none !important; touch-action: pan-x pan-y !important; -ms-scroll-chaining: none !important; }} header, [data-tauri-drag-region], [data-window-drag-region] {{ overscroll-behavior: none !important; -ms-scroll-chaining: none !important; }}';
            (document.head || document.documentElement).appendChild(style);
        }})();

        window.addEventListener('offline', function() {{
            try {{
                fetch("http://127.0.0.1:47620/offline", {{ method: "POST", mode: "no-cors" }});
            }} catch(e) {{}}
        }});

        document.addEventListener('contextmenu', function(e) {{ e.preventDefault(); }}, true);

        document.addEventListener('dblclick', function(e) {{
            var isText = e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
            if (!isText) {{
                e.preventDefault();
            }}
        }}, true);

        window.addEventListener('wheel', function(e) {{
            if (e.ctrlKey) {{
                e.preventDefault();
            }}
        }}, {{ passive: false }});

        window.addEventListener('touchstart', function(e) {{
            if (e.touches && e.touches.length > 1) {{
                e.preventDefault();
            }}
        }}, {{ passive: false }});

        function handleKeyLock(e) {{
            // Emergency native failsafe exit shortcut: Ctrl+Shift+Q, Cmd+Shift+Q, Alt+Shift+Q, Ctrl+Shift+Escape
            var isEmergencyExit = ((e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey && (e.key === 'Q' || e.key === 'q' || e.key === 'Escape'));
            if (isEmergencyExit) {{
                e.preventDefault();
                e.stopPropagation();
                if (e.type === 'keydown') {{
                    try {{
                        fetch("http://127.0.0.1:47620/request-exit", {{ method: "POST", mode: "no-cors" }});
                    }} catch(err) {{}}
                }}
                return;
            }}

            var isInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].indexOf(e.key) !== -1;
            var isDev = e.key === 'F12' || isInspect || ((e.ctrlKey || e.metaKey) && ['U', 'u', 'S', 's', 'P', 'p', 'O', 'o', 'H', 'h', 'J', 'j'].indexOf(e.key) !== -1);
            var isNav = (e.altKey && ['Tab', 'Left', 'Right', 'F4', ' '].indexOf(e.key) !== -1) ||
                        ((e.ctrlKey || e.metaKey) && ['Tab', 'w', 'W', 'q', 'Q', 't', 'T', 'n', 'N'].indexOf(e.key) !== -1) ||
                        (e.key === 'Tab' && (e.ctrlKey || e.metaKey));

            if (isDev || isNav || e.key === 'F11' || e.key === 'F1' || e.key === 'F3' || e.key === 'F10') {{
                e.preventDefault();
                e.stopPropagation();
            }}
        }}

        document.addEventListener('keydown', handleKeyLock, true);
        document.addEventListener('keyup', handleKeyLock, true);
        document.addEventListener('keypress', handleKeyLock, true);

        if (navigator.keyboard && navigator.keyboard.lock) {{
            try {{
                navigator.keyboard.lock(['Escape', 'Tab', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
            }} catch(err) {{}}
        }}
        "#
    )
}
