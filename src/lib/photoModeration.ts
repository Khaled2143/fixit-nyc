import vision from "@google-cloud/vision";

const UNSAFE_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);
// Racy content (suggestive but not explicit - lingerie, provocative poses,
// etc.) gets a lower bar than adult/violence: even "POSSIBLE" is blocked,
// since stylized/cartoon content that's genuinely suggestive tends to score
// lower here than real photos of the same thing would.
const RACY_UNSAFE_LIKELIHOODS = new Set(["POSSIBLE", "LIKELY", "VERY_LIKELY"]);

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

  const isUnsafe =
    [safeSearch.adult, safeSearch.violence].some(
      (likelihood) => likelihood && UNSAFE_LIKELIHOODS.has(String(likelihood)),
    ) || (safeSearch.racy != null && RACY_UNSAFE_LIKELIHOODS.has(String(safeSearch.racy)));

  return !isUnsafe;
}
