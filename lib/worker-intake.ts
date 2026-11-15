import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSION } from "./legal";

export const categories = {
  "IRT / Asisten Rumah Tangga": ["Bersih rumah", "Cuci dan setrika", "Memasak"],
  "Tukang Bangunan": ["Pasang bata", "Pasang keramik", "Cat bangunan", "Plester dan aci"],
  "Tenaga Rewang Hajatan": ["Persiapan bahan", "Masak hajatan", "Prasmanan", "Cuci peralatan"],
  "Sopir Harian": ["Mobil manual", "Mobil otomatis", "Perjalanan luar kota"],
  "Tukang Kebun": ["Pangkas tanaman", "Rawat tanaman", "Potong rumput"],
  "Kuli Harian": ["Angkut barang", "Bongkar muat", "Bantu pekerjaan bangunan"],
  "Baby Sitter": ["Rawat bayi", "Dampingi balita", "Siapkan makanan anak"],
  "Perawat Lansia": ["Dampingi lansia", "Bantu mobilitas", "Bantu aktivitas harian"],
  "Jasa Kebersihan": ["Bersih kantor", "Bersih pascarenovasi", "Bersih kamar mandi"],
};

export const districts = {
  Laweyan: "Kota Surakarta",
  Serengan: "Kota Surakarta",
  "Pasar Kliwon": "Kota Surakarta",
  Jebres: "Kota Surakarta",
  Banjarsari: "Kota Surakarta",
  Kartasura: "Kabupaten Sukoharjo",
  Grogol: "Kabupaten Sukoharjo",
  Sukoharjo: "Kabupaten Sukoharjo",
  Colomadu: "Kabupaten Karanganyar",
  Banyudono: "Kabupaten Boyolali",
  "Klaten Tengah": "Kabupaten Klaten",
  Wonogiri: "Kabupaten Wonogiri",
};

export const emptyWorker = () => ({
  nama_lengkap: "", nama_panggilan: "", no_wa: "", jenis_kelamin: "", tanggal_lahir: "",
  kategori_utama: "", kecamatan: "", kelurahan: "", kabupaten_kota: "",
  tarif_harian: "", tarif_per_jam: "", pengalaman_tahun: "", bio: "", keahlian: [] as string[],
  is_verified: false, is_available: true, izin_sebar_nomor: false,
});
export type WorkerDraft = ReturnType<typeof emptyWorker>;
export type PortfolioDraft = { id: string; file: File; title: string };
export const whatsappPattern = /^08[0-9]{8,11}$/;
export const slugFromName = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const imageExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const imageAccept = Object.keys(imageExtensions).join(",");
export const imageError = (file: File) => !Object.hasOwn(imageExtensions, file.type)
  ? "Gunakan foto JPG, PNG, atau WebP."
  : !file.size || file.size > 5 * 1024 * 1024 ? "Ukuran setiap foto harus lebih dari 0 dan maksimal 5 MB." : "";
export const consentExtensions: Record<string,string> = { ...imageExtensions, "application/pdf": "pdf" };
export const consentAccept = Object.keys(consentExtensions).join(",");
export const consentError = (file: File) => !Object.hasOwn(consentExtensions,file.type)
  ? "Gunakan formulir bertanda tangan dalam format PDF, JPG, PNG, atau WebP."
  : !file.size || file.size > 5 * 1024 * 1024 ? "Ukuran formulir harus lebih dari 0 dan maksimal 5 MB." : "";

export class DuplicateWhatsApp extends Error {}

export async function saveWorker(
  client: SupabaseClient, adminId: string, draft: WorkerDraft,
  profile: File | null, ktp: File | null, portfolios: PortfolioDraft[], consent: File,
) {
  const number = draft.no_wa.trim();
  const { data: duplicate, error: checkError } = await client.rpc("admin_worker_phone_exists", { p_no_wa: number });
  if (checkError) throw new Error("Nomor WhatsApp belum bisa diperiksa. Coba lagi.");
  if (duplicate) throw new DuplicateWhatsApp();

  const uploadFolder = `${adminId}/${crypto.randomUUID()}`;
  const uploaded: { bucket: string; path: string }[] = [];
  let canCleanUp = true;
  const upload = async (bucket: string, name: string, file: File | null) => {
    if (!file) return null;
    const path = `${uploadFolder}/${name}.${imageExtensions[file.type]}`;
    uploaded.push({ bucket, path });
    const {error} = await client.storage.from(bucket).upload(path, file, { contentType: file.type });
    if (error) throw new Error("Foto belum bisa diunggah. Coba simpan lagi.");
    return path;
  };
  try {
    const profilePath = await upload("worker-public-media", "profil", profile);
    const ktpPath = await upload("worker-private-ktp", "ktp", ktp);
    const consentPath = `${uploadFolder}/persetujuan.${consentExtensions[consent.type]}`;
    uploaded.push({bucket:"worker-private-consent",path:consentPath});
    const {error:consentUploadError}=await client.storage.from("worker-private-consent")
      .upload(consentPath,consent,{contentType:consent.type});
    if(consentUploadError) throw new Error("Formulir persetujuan belum bisa diunggah.");
    const items = [];
    for (const [index, item] of portfolios.entries()) {
      items.push({ title: item.title.trim(), path: await upload("worker-public-media", `portofolio-${index + 1}`, item.file) });
    }
    const optionalNumber = (value: string) => value === "" ? null : Number(value);
    canCleanUp = false;
    const { data, error } = await client.rpc("admin_create_worker_with_consent", {
      p_worker: {
        ...draft, no_wa: number, slug: slugFromName(draft.nama_lengkap),
        tarif_harian: Number(draft.tarif_harian), tarif_per_jam: optionalNumber(draft.tarif_per_jam),
        pengalaman_tahun: optionalNumber(draft.pengalaman_tahun),
      },
      p_upload_folder: uploadFolder, p_profile_path: profilePath, p_ktp_path: ktpPath,
      p_portfolios: items,
      p_public_base: client.storage.from("worker-public-media").getPublicUrl("").data.publicUrl.replace(/\/$/, ""),
      p_consent_path: consentPath, p_consent_version: LEGAL_VERSION,
    });
    if (error) {
      // Keep files if the server response was lost after committing the database write.
      canCleanUp = /^[0-9A-Z]{5}$/.test(error.code) && !error.code.startsWith("08") && error.code !== "40003";
      if (error.code === "RW001") throw new DuplicateWhatsApp();
      throw new Error(canCleanUp ? "Data belum tersimpan. Periksa isian lalu coba lagi." : "Status simpan belum bisa dipastikan. Periksa nomor WhatsApp sebelum mengulang.");
    }
    return data as string;
  } catch (error) {
    if (canCleanUp) {
      await Promise.allSettled(uploaded.map(({ bucket, path }) => client.storage.from(bucket).remove([path])));
    }
    throw error;
  }
}
