import { afterEach, describe, expect, it, vi } from "vitest";

import { backoff } from "./backoff";

describe("backoff", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("resolves after a single successful attempt without retrying", async () => {
		const callback = vi
			.fn<[], Promise<void>>()
			.mockResolvedValue(undefined);

		await backoff(callback, { retries: 3, delayMs: 1000, delayFactor: 2 });

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("retries until the callback succeeds", async () => {
		vi.useFakeTimers();

		const callback = vi
			.fn<[], Promise<void>>()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockResolvedValue(undefined);

		const promise = backoff(callback, {
			retries: 5,
			delayMs: 1000,
			delayFactor: 3,
		});

		await vi.runAllTimersAsync();
		await promise;

		expect(callback).toHaveBeenCalledTimes(3);
	});

	it("uses exponential delays between retries", async () => {
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		const callback = vi
			.fn<[], Promise<void>>()
			.mockRejectedValue(new Error("boom"));

		const promise = backoff(callback, {
			retries: 3,
			delayMs: 1000,
			delayFactor: 4,
		});

		await vi.runAllTimersAsync();
		await promise;

		const recordedDelays = setTimeoutSpy.mock.calls.map((call) => call[1]);
		expect(recordedDelays).toEqual([1000, 4000, 16000]);
		expect(callback).toHaveBeenCalledTimes(3);
	});

	it("short-circuits when retries are exhausted up front", async () => {
		const callback = vi
			.fn<[], Promise<void>>()
			.mockResolvedValue(undefined);

		const result = await backoff(callback, {
			retries: 0,
			delayMs: 1000,
			delayFactor: 2,
		});

		expect(result).toBe(false);
		expect(callback).not.toHaveBeenCalled();
	});
});
