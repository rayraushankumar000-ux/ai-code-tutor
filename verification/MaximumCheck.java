public class MaximumCheck {

    static int originalMaximum(int a, int b) {
        int max = a;

        if (a > max) {
            max = a;
        }

        if (b > max) {
            max = b;
        }

        return max;
    }

    static int correctedMaximum(int a, int b) {
        int max = a;

        if (b > max) {
            max = b;
        }

        return max;
    }

    public static void main(String[] args) {
        int[][] tests = {
            {5, 3, 5},
            {2, 8, 8},
            {4, 4, 4},
            {-5, -3, -3},
            {0, 7, 7}
        };

        int originalPassed = 0;
        int correctedPassed = 0;

        System.out.println("a\tb\tExpected\tOriginal\tCorrected");

        for (int[] test : tests) {
            int a = test[0];
            int b = test[1];
            int expected = test[2];

            int original = originalMaximum(a, b);
            int corrected = correctedMaximum(a, b);

            if (original == expected) {
                originalPassed++;
            }

            if (corrected == expected) {
                correctedPassed++;
            }

            System.out.printf(
                "%d\t%d\t%d\t\t%d\t\t%d%n",
                a, b, expected, original, corrected
            );
        }

        System.out.println(
            "\nOriginal passed: " + originalPassed + "/" + tests.length
        );
        System.out.println(
            "Corrected passed: " + correctedPassed + "/" + tests.length
        );
    }
}