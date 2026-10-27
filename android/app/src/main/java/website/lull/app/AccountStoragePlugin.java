package website.lull.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AccountStorage")
public class AccountStoragePlugin extends Plugin {
    private static final String ALIAS = "lull.account.v1";
    private synchronized SecretKey secret() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private String key(PluginCall call) throws Exception {
        String key = call.getString("key", "");
        if (!key.matches("lull-account(?:-[a-z-]+)?")) throw new Exception("Invalid key");
        return key;
    }
    private SharedPreferences prefs() { return getContext().getSharedPreferences("lull-account", Context.MODE_PRIVATE); }
    @PluginMethod public void get(PluginCall call) {
        try {
            String value = prefs().getString(key(call), null);
            JSObject result = new JSObject();
            if (value == null) { result.put("value", JSObject.NULL); call.resolve(result); return; }
            String[] parts = value.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secret(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("Не удалось прочитать сохранённый вход"); }
    }
    @PluginMethod public void set(PluginCall call) {
        try {
            String key = key(call), value = call.getString("value");
            if (value == null) { if (!prefs().edit().remove(key).commit()) throw new Exception(); call.resolve(); return; }
            if (value.length() > 100000) throw new Exception();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret());
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!prefs().edit().putString(key, encrypted).commit()) throw new Exception();
            call.resolve();
        } catch (Exception error) { call.reject("Не удалось сохранить вход"); }
    }
}
