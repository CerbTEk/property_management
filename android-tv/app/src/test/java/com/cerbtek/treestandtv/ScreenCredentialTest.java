package com.cerbtek.treestandtv;
import org.junit.Test;
import static org.junit.Assert.*;
public class ScreenCredentialTest {
 private final String token="a".repeat(64);
 @Test public void acceptsOnlyOwnedScreenLinks(){assertEquals(token,ScreenCredential.parse("https://treestand-manager.webflow.io/display/#"+token));assertEquals(token,ScreenCredential.parse(token));}
 @Test public void rejectsForeignHostsAndMalformedLinks(){for(String link:new String[]{"http://treestand-manager.webflow.io/display/#"+token,"https://evil.example/display/#"+token,"https://treestand-manager.webflow.io.evil.example/display/#"+token,"https://treestand-manager.webflow.io/app/#"+token,"https://treestand-manager.webflow.io:443/display/#"+token,"https://treestand-manager.webflow.io/display/?x=1#"+token,"abc", "https://user@treestand-manager.webflow.io/display/#"+token}){try{ScreenCredential.parse(link);fail("Accepted untrusted link");}catch(IllegalArgumentException expected){}}}
}
