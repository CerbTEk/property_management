package com.cerbtek.treestandtv;
import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
 private static final String ENDPOINT="https://pjeejfntvtbqbsuxcwds.supabase.co/functions/v1/guest-display";
 private final Handler handler=new Handler(Looper.getMainLooper());
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private LinearLayout root,content;
 private TextView status;
 private String token="";
 private boolean active=false;
 private int generation=0;
 private final Runnable refresh=this::fetchDisplay;
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);token=getPreferences(MODE_PRIVATE).getString("screen_token","");showLayout();}
 @Override protected void onResume(){super.onResume();active=true;if(token.isEmpty())showSetup();else fetchDisplay();}
 @Override protected void onPause(){active=false;generation++;handler.removeCallbacks(refresh);super.onPause();}
 @Override protected void onDestroy(){worker.shutdownNow();super.onDestroy();}
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setPadding(0,dp(8),0,dp(8));return v;}
 private void showLayout(){
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(18,60,53));
  root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(48),dp(32),dp(48),dp(32));scroll.addView(root);setContentView(scroll);
  ImageView brand=new ImageView(this);brand.setImageResource(com.cerbtek.treestandtv.R.drawable.brand_logo);brand.setContentDescription("Treestand Manager");brand.setColorFilter(Color.rgb(245,242,233));brand.setScaleType(ImageView.ScaleType.FIT_CENTER);
  LinearLayout.LayoutParams brandSize=new LinearLayout.LayoutParams(dp(280),dp(94));brandSize.bottomMargin=dp(12);root.addView(brand,brandSize);
  root.addView(text("WELCOME",18,Color.rgb(153,204,173)));
  status=text("Connecting…",22,Color.rgb(245,242,233));root.addView(status);
  content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);root.addView(content);
  LinearLayout controls=new LinearLayout(this);root.addView(controls);
  Button retry=new Button(this);retry.setText("Refresh display");retry.setOnClickListener(v->fetchDisplay());controls.addView(retry);
  Button settings=new Button(this);settings.setText("Screen settings");settings.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Screen connection").setMessage("Disconnect this TV to enter a new pairing code. Revoke this display in the host workspace to invalidate its saved connection.").setPositiveButton("Disconnect",(d,w)->{generation++;handler.removeCallbacks(refresh);token="";getPreferences(MODE_PRIVATE).edit().clear().apply();content.removeAllViews();showSetup();}).setNegativeButton("Keep connection",null).show());controls.addView(settings);
 }
 private void showSetup(){
  content.removeAllViews();status.setText("Connect this TV from Guest Experience → Create pairing code.");
  EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);input.setHint("Pairing code or private screen link");input.setTextColor(Color.rgb(245,242,233));input.setHintTextColor(Color.rgb(214,233,220));content.addView(input);
  Button connect=new Button(this);connect.setText("Connect screen");content.addView(connect);connect.setOnClickListener(v->{String code=ScreenCredential.pairingCode(input.getText().toString());if(code!=null){pairScreen(code,connect);return;}try{token=ScreenCredential.parse(input.getText().toString());getPreferences(MODE_PRIVATE).edit().putString("screen_token",token).apply();content.removeAllViews();fetchDisplay();}catch(IllegalArgumentException e){status.setText(e.getMessage());}});input.requestFocus();
 }
 private void pairScreen(String code,Button connect){
  connect.setEnabled(false);status.setText("Pairing…");final int request=++generation;
  worker.execute(()->{String result=null;HttpsURLConnection connection=null;
   try{
    connection=(HttpsURLConnection)new URL(ENDPOINT).openConnection();connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setRequestProperty("Content-Type","application/json");
    byte[] body=new JSONObject().put("code",code).toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(body.length);
    try(OutputStream out=connection.getOutputStream()){out.write(body);}
    if(connection.getResponseCode()==200){try(InputStream stream=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[1024];int n;while((n=stream.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>4096)throw new IllegalStateException();}result=ScreenCredential.parse(new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())).getString("token"));}}
   }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
   final String credential=result;handler.post(()->{if(!active||request!=generation)return;connect.setEnabled(true);if(credential==null){status.setText("Pairing failed. Check the code, expiry and connection.");return;}token=credential;getPreferences(MODE_PRIVATE).edit().putString("screen_token",token).apply();content.removeAllViews();fetchDisplay();});
  });
 }
 private void fetchDisplay(){
  handler.removeCallbacks(refresh);if(!active||token.isEmpty())return;
  final String credential=token;final int request=++generation;
  worker.execute(()->{
   JSONObject payload=null;String problem="Connection lost. Waiting to reconnect…";HttpsURLConnection connection=null;
   try{
    connection=(HttpsURLConnection)new URL(ENDPOINT).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+credential);connection.setUseCaches(false);
    int code=connection.getResponseCode();if(code==401)problem="Screen link expired or revoked. Create a new link in Guest Experience.";
    if(code==200){try(InputStream stream=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=stream.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>131072)throw new IllegalStateException();}payload=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));}}
   }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
   final JSONObject result=payload;final String message=problem;
   handler.post(()->{if(!active||request!=generation)return;content.removeAllViews();if(result==null){status.setText(message);}else{try{render(result);status.setText("");}catch(Exception ignored){content.removeAllViews();status.setText("Display temporarily unavailable.");}}handler.postDelayed(refresh,60000);});
  });
 }
 private void render(JSONObject payload)throws Exception{
  JSONObject p=payload.getJSONObject("property"),d=payload.getJSONObject("display");
  content.addView(text(p.getString("name"),20,Color.rgb(153,204,173)));
  content.addView(text(d.getString("title").replace("{{guest}}","Guest"),40,Color.rgb(245,242,233)));
  content.addView(text(d.optString("welcome"),24,Color.rgb(245,242,233)));
  content.addView(text("Check-in "+p.getString("check_in").substring(0,5)+"  ·  Check-out "+p.getString("check_out").substring(0,5),20,Color.rgb(214,233,220)));
  String[][] sections={{"Your house guide","guidebook"},{"Explore nearby","recommendations"},{"Need a hand?","contact"}};
  for(String[] s:sections){String body=d.optString(s[1]);if(!body.isEmpty()){content.addView(text(s[0],26,Color.rgb(153,204,173)));content.addView(text(body,22,Color.rgb(245,242,233)));}}
 }
}
