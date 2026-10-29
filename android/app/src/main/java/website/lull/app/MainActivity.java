package website.lull.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AccountStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
