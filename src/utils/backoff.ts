type BackoffOptions = {
	retries: number;
	delayMs: number;
	delayFactor: number;
};

const DEFAULT_BACKOFF_RETRIES = 10;
const DEFAULT_BACKOFF_DELAY_MS = 1000;
const DEFAULT_BACKOFF_DELAY_FACTOR = 2;

const DEFAULT_BACKOFF_OPTIONS: BackoffOptions = {
	retries: DEFAULT_BACKOFF_RETRIES,
	delayMs: DEFAULT_BACKOFF_DELAY_MS,
	delayFactor: DEFAULT_BACKOFF_DELAY_FACTOR,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries an action using an exponential backoff strategy
 *
 * @param callback The action to be executed on every try
 */
export async function backoff(
	callback: () => Promise<void>,
	options?: BackoffOptions,
) {
	const config = Object.assign({}, DEFAULT_BACKOFF_OPTIONS, options);

	if (config.retries === 0) {
		return false;
	}

	try {
		await callback();
	} catch (err) {
		await sleep(config.delayMs);

		await backoff(callback, {
			...config,
			retries: config.retries - 1,
			delayMs: config.delayMs * config.delayFactor,
		});
	}
}
