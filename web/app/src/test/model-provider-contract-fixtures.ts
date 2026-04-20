import type {
  ConsoleModelProviderCatalogResponse,
  ConsoleModelProviderOptions
} from '@1flowbase/api-client';
import modelProviderCatalogContractJson from '@1flowbase/model-provider-contracts/catalog.multiple-providers.json';
import modelProviderOptionsContractJson from '@1flowbase/model-provider-contracts/options.multiple-providers.json';

export const modelProviderCatalogContract =
  modelProviderCatalogContractJson as ConsoleModelProviderCatalogResponse;
export const modelProviderOptionsContract =
  modelProviderOptionsContractJson as ConsoleModelProviderOptions;

export const modelProviderCatalogEntries = modelProviderCatalogContract.entries;
export const modelProviderOptionInstances = modelProviderOptionsContract.instances;
export const primaryContractProviderModels = modelProviderOptionsContract.instances[0].models;
