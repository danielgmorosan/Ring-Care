# Eclipse Paho references javax.* and org.eclipse.paho internals reflectively.
-keep class org.eclipse.paho.** { *; }
-dontwarn org.eclipse.paho.**

# BouncyCastle providers are loaded by name.
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# kotlinx.serialization generated serializers.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keep,includedescriptorclasses class ai.obrigada.guardian.**$$serializer { *; }
-keepclassmembers class ai.obrigada.guardian.** {
    *** Companion;
}
-keepclasseswithmembers class ai.obrigada.guardian.** {
    kotlinx.serialization.KSerializer serializer(...);
}
