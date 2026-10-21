package com.attendance.tracker;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AttendanceBluetoothPlugin.class);
    super.onCreate(savedInstanceState);
    CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
    getBridge().getWebView().getSettings().setTextZoom(100);
    getBridge().getWebView().getSettings().setLoadWithOverviewMode(true);
    getBridge().getWebView().getSettings().setUseWideViewPort(false);
    getBridge().getWebView().getSettings().setSupportZoom(false);
    getBridge().getWebView().getSettings().setBuiltInZoomControls(false);
    getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
  }
}
