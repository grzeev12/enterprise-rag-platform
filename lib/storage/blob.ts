import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { readEnv, requireEnv } from "@/lib/env";

export type ObjectStorageProvider = "azure-blob" | "cloudflare-r2";

let containerClient: ContainerClient | null = null;

export function getObjectStorageProvider(): ObjectStorageProvider {
  const provider = readEnv("OBJECT_STORAGE_PROVIDER") ?? "azure-blob";

  if (provider === "azure-blob" || provider === "cloudflare-r2") {
    return provider;
  }

  throw new Error(`Unsupported object storage provider: ${provider}`);
}

export function getObjectStorageContainerName() {
  return (
    readEnv("OBJECT_STORAGE_CONTAINER") ??
    readEnv("AZURE_STORAGE_CONTAINER_NAME") ??
    "enterprise-ai-saas"
  );
}

export function isObjectStorageConfigured() {
  const provider = readEnv("OBJECT_STORAGE_PROVIDER") ?? "azure-blob";

  if (provider === "azure-blob") {
    return Boolean(readEnv("AZURE_STORAGE_CONNECTION_STRING"));
  }

  if (provider === "cloudflare-r2") {
    return Boolean(
      readEnv("R2_ENDPOINT") &&
        readEnv("R2_ACCESS_KEY_ID") &&
        readEnv("R2_SECRET_ACCESS_KEY") &&
        getObjectStorageContainerName()
    );
  }

  return false;
}

export function getBlobContainerClient() {
  if (containerClient) return containerClient;

  const provider = getObjectStorageProvider();
  if (provider !== "azure-blob") {
    throw new Error("Cloudflare R2 object storage adapter is scaffolded but not implemented yet");
  }

  const connectionString = requireEnv("AZURE_STORAGE_CONNECTION_STRING", "blob storage");
  const containerName = getObjectStorageContainerName();

  containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
    containerName
  );

  return containerClient;
}

export async function ensureBlobContainer() {
  const container = getBlobContainerClient();
  await container.createIfNotExists();
  return container;
}

export async function uploadTextBlob(key: string, text: string, contentType = "text/plain") {
  const container = await ensureBlobContainer();
  const blob = container.getBlockBlobClient(key);

  await blob.upload(text, Buffer.byteLength(text), {
    blobHTTPHeaders: {
      blobContentType: contentType
    }
  });

  return {
    key,
    url: blob.url
  };
}
