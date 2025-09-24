import { PastaExperiment, PastaSettings } from "../settings";

export const isExperimentEnabled = (
	settings: PastaSettings,
	experiment: PastaExperiment,
) => settings.experiments.get(experiment) === true;
