export const problems = [
  {
    id: "sum",
    title: "Sum of two numbers",
    difficulty: "Easy",
    goal:
      "Read two integers a and b from standard input and print their sum only. Constraints: -1000000 <= a,b <= 1000000.",
    input: "Two integers separated by whitespace.",
    output: "One integer: the sum of the two numbers.",
    cases: [
      { stdin: "5 3", expected_output: "8" },
      { stdin: "-5 3", expected_output: "-2" },
      { stdin: "0 0", expected_output: "0" },
    ],
  },
  {
    id: "maximum",
    title: "Maximum of two numbers",
    difficulty: "Easy",
    goal:
      "Read two integers a and b from standard input and print the larger value only. Handle negative and equal values. Constraints: -1000000 <= a,b <= 1000000.",
    input: "Two integers separated by whitespace.",
    output: "One integer: the larger value.",
    cases: [
      { stdin: "5 3", expected_output: "5" },
      { stdin: "4 4", expected_output: "4" },
      { stdin: "-5 -3", expected_output: "-3" },
    ],
  },
  {
    id: "parity",
    title: "Even or odd",
    difficulty: "Easy",
    goal:
      "Read one integer n from standard input. Print exactly Even if n is divisible by 2, otherwise print Odd. Zero is even. Constraints: -1000000 <= n <= 1000000.",
    input: "One integer.",
    output: "Exactly Even or Odd. Capitalization must match.",
    cases: [
      { stdin: "8", expected_output: "Even" },
      { stdin: "-3", expected_output: "Odd" },
      { stdin: "0", expected_output: "Even" },
    ],
  },
  {
    id: "factorial",
    title: "Factorial",
    difficulty: "Easy",
    goal:
      "Read one integer n from standard input and print n factorial only. Define 0 factorial as 1. Constraints: 0 <= n <= 12.",
    input: "One integer from 0 to 12.",
    output: "One integer: the factorial of n.",
    cases: [
      { stdin: "5", expected_output: "120" },
      { stdin: "0", expected_output: "1" },
      { stdin: "12", expected_output: "479001600" },
    ],
  },
  {
    id: "reverse",
    title: "Reverse a string",
    difficulty: "Easy",
    goal:
      "Read one line of ASCII text from standard input and print its characters in reverse order. Preserve spaces and letter case. Exclude the input line terminator. Constraints: 1 to 100 characters.",
    input: "One line of ASCII text. It can contain spaces.",
    output: "The reversed text, preserving spaces and letter case.",
    cases: [
      { stdin: "hello", expected_output: "olleh" },
      { stdin: "a b", expected_output: "b a" },
      { stdin: "A", expected_output: "A" },
    ],
  },
];