package com.attendance.tracker;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getBridge().getWebView().getSettings().setTextZoom(100);
    getBridge().getWebView().getSettings().setLoadWithOverviewMode(true);
    getBridge().getWebView().getSettings().setUseWideViewPort(false);
    getBridge().getWebView().getSettings().setSupportZoom(false);
    getBridge().getWebView().getSettings().setBuiltInZoomControls(false);
    getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
  }
}
