export type Language = {
  id: string;
  label: string;
  starter: string;
};

export const LANGUAGES: Language[] = [
  {
    id: "go",
    label: "Go",
    starter: `package main

import "fmt"

func main() {
	fmt.Println("Hello, MiniAlgothon")
}
`,
  },
  {
    id: "python",
    label: "Python",
    starter: `def main():
    print("Hello, MiniAlgothon")


if __name__ == "__main__":
    main()
`,
  },
  {
    id: "javascript",
    label: "JavaScript",
    starter: `function main() {
  console.log("Hello, MiniAlgothon");
}

main();
`,
  },
];
