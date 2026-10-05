package com.cerbtek.treestandtv;
import java.net.URI;
public final class ScreenCredential {
 private ScreenCredential() {}
 public static String pairingCode(String value) {
  if(value==null)return null;
  String code=value.trim().toUpperCase(java.util.Locale.ROOT).replaceAll("[\\s-]","");
  return code.matches("[0-9A-HJKMNP-TV-Z]{16}")?code:null;
 }
 public static String parse(String value) {
  if(value==null)throw new IllegalArgumentException("Enter your private screen link.");
  String input=value.trim();
  if(input.matches("[0-9a-f]{64}"))return input;
  try {
   URI uri=URI.create(input);
   if(!"https".equals(uri.getScheme())||!"treestand-manager.webflow.io".equals(uri.getHost())||uri.getPort()!=-1||uri.getUserInfo()!=null||uri.getQuery()!=null||!"/display/".equals(uri.getPath()))throw new IllegalArgumentException();
   String token=uri.getFragment();
   if(token!=null&&token.matches("[0-9a-f]{64}"))return token;
  } catch(IllegalArgumentException ignored) {}
  throw new IllegalArgumentException("Use the private screen link from Treestand Guest Experience.");
 }
}
