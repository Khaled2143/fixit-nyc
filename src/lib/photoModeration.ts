import vision from "@google-cloud/vision";

const UNSAFE_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

let client: InstanceType<typeof vision.ImageAnnotatorClient> | null = null;

function getClient() {
  if (!client) {
    client = new vision.ImageAnnotatorClient({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!),
    });
  }
  return client;
}

export async function isPhotoSafe(buffer: Buffer): Promise<boolean> {
  const [result] = await getClient().safeSearchDetection(buffer);
  const safeSearch = result.safeSearchAnnotation;

  if (!safeSearch) return false;

  return ![safeSearch.adult, safeSearch.violence, safeSearch.racy].some(
    (likelihood) => likelihood && UNSAFE_LIKELIHOODS.has(String(likelihood)),
  );
}
