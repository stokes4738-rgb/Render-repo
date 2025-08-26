# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Capacitor Rules
-keep class com.getcapacitor.** { *; }
-keep class com.pocketbounty.app.** { *; }

# Keep all classes in the main package
-keep class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorPlugin public *;
}

# WebView and JavaScript interface
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor and Cordova plugins
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin

# Common Android rules
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.android.** { *; }

# Preserve line numbers for crash reports
-keepattributes SourceFile,LineNumberTable

# Prevent obfuscation of input/output classes for JavaScript interfaces
-keepclassmembers class fqcn.of.javascript.interface.for.webview {
   public *;
}
