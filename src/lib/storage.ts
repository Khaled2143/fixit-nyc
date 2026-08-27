export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch("/api/photos", { method: "POST", body: formData });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Failed to upload photo." }));
    throw new Error(body.error ?? "Failed to upload photo.");
  }

  const { photoUrl } = await response.json();
  return photoUrl;
}
