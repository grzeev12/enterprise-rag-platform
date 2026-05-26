import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

let containerClient: ContainerClient | null = null;

export function getBlobContainerClient() {
  if (containerClient) return containerClient;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "enterprise-ai-saas";

  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is required for blob storage");
  }

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
