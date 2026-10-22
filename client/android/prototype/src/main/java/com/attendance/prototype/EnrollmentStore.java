package com.attendance.prototype;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.io.*;
import java.security.*;
import java.util.Arrays;

/** Device-local demo enrollment, encrypted at rest; no raw camera image is persisted. */
public final class EnrollmentStore {
    private static final String ALIAS = "threshold.prototype.enrollment.v1";
    private final File file;
    public EnrollmentStore(Context context) { file = new File(context.getNoBackupFilesDir(), "enrollment.enc"); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    public boolean exists() { return file.exists(); }
    public JSONObject read() throws Exception {
        byte[] data = Files.readAllBytes(file.toPath());
        if (data.length < 29) throw new IOException("Enrollment is unreadable; supervised reset is required");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOfRange(data,0,12)));
        byte[] clear = cipher.doFinal(Arrays.copyOfRange(data,12,data.length));
        try { return new JSONObject(new String(clear, StandardCharsets.UTF_8)); }
        finally { Arrays.fill(clear, (byte) 0); }
    }
    public void save(String name, String roll, String supervisor, char[] pin, float[] embedding) throws Exception {
        byte[] salt = new byte[16]; new SecureRandom().nextBytes(salt);
        JSONArray vector = new JSONArray(); for (float f : embedding) vector.put((double) f);
        JSONObject record = new JSONObject().put("name",name).put("roll",roll).put("supervisor",supervisor)
            .put("enrolledAt",System.currentTimeMillis()).put("model","SFace-2021dec").put("template",vector)
            .put("salt",Base64.encodeToString(salt,Base64.NO_WRAP)).put("pinHash",Base64.encodeToString(derive(pin,salt),Base64.NO_WRAP));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] clear = record.toString().getBytes(StandardCharsets.UTF_8);
        File temp = new File(file.getParentFile(), "enrollment.tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(cipher.getIV()); out.write(cipher.doFinal(clear)); out.getFD().sync();
        } finally { Arrays.fill(clear, (byte)0); Arrays.fill(pin, '\0'); }
        if (!temp.renameTo(file)) throw new IOException("Could not save enrollment");
    }
    private byte[] derive(char[] pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin,salt,210000,256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    public boolean unlock(char[] pin) throws Exception {
        JSONObject record = read();
        try { return MessageDigest.isEqual(Base64.decode(record.getString("pinHash"),Base64.NO_WRAP), derive(pin,Base64.decode(record.getString("salt"),Base64.NO_WRAP))); }
        finally { Arrays.fill(pin,'\0'); }
    }
    public float[] template() throws Exception {
        JSONArray array = read().getJSONArray("template"); float[] vector = new float[array.length()];
        for (int i=0;i<vector.length;i++) vector[i] = (float) array.getDouble(i);
        return FaceMath.normalized(vector);
    }
    public void delete() throws Exception {
        if (file.exists() && !file.delete()) throw new IOException("Could not delete enrollment");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(ALIAS);
    }
}
