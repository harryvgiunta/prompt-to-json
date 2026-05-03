import { contractResourceUri, parseJsonContractUri } from "./security.js";
import type { ResourceDescription } from "./types.js";
import type { ContractStore } from "./contract-loader.js";

export const CONTRACT_RESOURCE_MIME_TYPE = "application/json" as const;

export function listContractResources(store: ContractStore): ResourceDescription[] {
  return store.listContracts().map((contract) => ({
    uri: contractResourceUri(contract.name),
    name: contract.name,
    mimeType: CONTRACT_RESOURCE_MIME_TYPE,
    ...(contract.description ? { description: contract.description } : {})
  }));
}

export function listContractResourceTemplates(): Array<{
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: typeof CONTRACT_RESOURCE_MIME_TYPE;
}> {
  return [
    {
      uriTemplate: "json-contract://{name}",
      name: "json-contract",
      description: "Read a prompt-to-json contract by filename-derived contract name.",
      mimeType: CONTRACT_RESOURCE_MIME_TYPE
    }
  ];
}

export function readContractResource(
  store: ContractStore,
  uri: string
): {
  uri: string;
  mimeType: typeof CONTRACT_RESOURCE_MIME_TYPE;
  text: string;
} {
  const contractName = parseJsonContractUri(uri);
  const contract = store.getContract(contractName);
  const publicContract = store.toPublicContract(contract);

  return {
    uri: contractResourceUri(contract.name),
    mimeType: CONTRACT_RESOURCE_MIME_TYPE,
    text: JSON.stringify(publicContract, null, 2)
  };
}
