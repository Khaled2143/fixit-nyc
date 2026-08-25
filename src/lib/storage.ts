import { supabase } from "./supabase";

const PHOTO_BUCKET = "issue-photos";

export async function uploadPhoto(file: File): Promise<string> {
  const extension = file.name.split(".").pop();
  const filename = `${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(filename, file);
  if (error) throw error;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}
