export function buildGreeting(name: string): string {
    if (!name) {
        return "Hello, stranger";
    }

    const normalized = name.trim();

    return `Hello, ${normalized}`;
}

export function demoInlineCompletion(items: string[]): string[] {
    return items
        .filter((item) => item.length > 0)
        .map((item) => item.toUpperCase());
}

function runDemo() {
    const values = ["alpha", "beta", "gamma"];

    console.log(buildGreeting("tab complete"));
    console.log(demoInlineCompletion(values));
}

runDemo();

    