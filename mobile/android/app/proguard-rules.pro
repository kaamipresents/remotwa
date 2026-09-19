# Proguard rules for Remotva Mobile Bare React Native app

# React Native core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# Remotva Native modules & services
-keep class com.remotvamobile.** { *; }
-keep class com.remotvamobile.RemotvaMediaService { *; }
-keep class com.remotvamobile.RemotvaMediaModule { *; }
-keep class com.remotvamobile.RemotvaPackage { *; }

# BLE (react-native-ble-plx & native bluetooth)
-keep class com.polidea.rxandroidble2.** { *; }
-dontwarn com.polidea.rxandroidble2.**
-keep class com.bleplx.** { *; }

# OkHttp & WebSockets
-dontwarn okhttp3.**
-dontwarn okio.**
