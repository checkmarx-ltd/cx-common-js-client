import parseMilliseconds = require("parse-ms");

export class Stopwatch {
    private lastOperationStart: Date = new Date();

    start() {
        this.lastOperationStart = new Date();
    }

    getElapsedString(): string {
        let duration = parseMilliseconds(Date.now() - this.lastOperationStart.getTime());
        return `${Stopwatch.pad(duration.hours)}:${Stopwatch.pad(duration.minutes)}:${Stopwatch.pad(duration.seconds)}`;
    }

    getElapsedSeconds(): number {
        const elapsedMilliseconds = Date.now() - this.lastOperationStart.getTime();
        const millisecondsInSecond = 1000;
        return Math.round(elapsedMilliseconds / millisecondsInSecond);
    }

    private static pad(input: number) {
        const padding = input < 10 ? '0' : '';
        return padding + input;
    }
}