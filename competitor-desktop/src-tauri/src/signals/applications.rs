pub fn canonical_executable(value: &str) -> String {
    let name = value
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(value)
        .to_ascii_lowercase();
    let stem = name.strip_suffix(".exe").unwrap_or(&name);
    match stem {
        "idea64" | "idea" => "idea",
        "pycharm64" | "pycharm" => "pycharm",
        "clion64" | "clion" => "clion",
        "webstorm64" | "webstorm" => "webstorm",
        "goland64" | "goland" => "goland",
        "rider64" | "rider" => "rider",
        "phpstorm64" | "phpstorm" => "phpstorm",
        "rubymine64" | "rubymine" => "rubymine",
        "datagrip64" | "datagrip" => "datagrip",
        "studio64" | "studio" => "android-studio",
        _ => stem,
    }
    .to_string()
}

pub fn display_name(value: &str) -> &str {
    match value.to_ascii_lowercase().as_str() {
        "idea" | "idea64.exe" | "com.jetbrains.intellij" | "com.jetbrains.intellij.ce" => {
            "IntelliJ IDEA"
        }
        "pycharm" | "pycharm64.exe" | "com.jetbrains.pycharm" | "com.jetbrains.pycharm.ce" => {
            "PyCharm"
        }
        "clion" | "clion64.exe" | "com.jetbrains.clion" => "CLion",
        "webstorm" | "webstorm64.exe" | "com.jetbrains.webstorm" => "WebStorm",
        "goland" | "goland64.exe" | "com.jetbrains.goland" => "GoLand",
        "rider" | "rider64.exe" | "com.jetbrains.rider" => "Rider",
        "code" | "com.microsoft.vscode" => "Visual Studio Code",
        "android-studio" | "com.google.android.studio" => "Android Studio",
        _ => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_jetbrains_launchers_without_matching_unrelated_names() {
        assert_eq!(
            canonical_executable(r"C:\Program Files\JetBrains\IntelliJ IDEA\bin\idea64.exe"),
            "idea"
        );
        assert_eq!(canonical_executable("PYCHARM64.EXE"), "pycharm");
        assert_eq!(canonical_executable("clion64.exe"), "clion");
        assert_eq!(canonical_executable("idea64-helper.exe"), "idea64-helper");
        assert_eq!(canonical_executable("java.exe"), "java");
    }
}
