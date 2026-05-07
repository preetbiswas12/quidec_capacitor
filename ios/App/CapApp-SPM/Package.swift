// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.1"),
        .package(name: "CapacitorFirebaseAuthentication", path: "..\..\..\node_modules\.pnpm\@capacitor-firebase+authentication@8.2.0_@capacitor+core@8.3.1_firebase@12.12.1\node_modules\@capacitor-firebase\authentication"),
        .package(name: "CapacitorFirebaseMessaging", path: "..\..\..\node_modules\.pnpm\@capacitor-firebase+messaging@8.2.0_@capacitor+core@8.3.1_firebase@12.12.1\node_modules\@capacitor-firebase\messaging"),
        .package(name: "CapacitorApp", path: "..\..\..\node_modules\.pnpm\@capacitor+app@8.1.0_@capacitor+core@8.3.1\node_modules\@capacitor\app"),
        .package(name: "CapacitorCamera", path: "..\..\..\node_modules\.pnpm\@capacitor+camera@8.2.0_@capacitor+core@8.3.1\node_modules\@capacitor\camera"),
        .package(name: "CapacitorDevice", path: "..\..\..\node_modules\.pnpm\@capacitor+device@8.0.2_@capacitor+core@8.3.1\node_modules\@capacitor\device"),
        .package(name: "CapacitorFilesystem", path: "..\..\..\node_modules\.pnpm\@capacitor+filesystem@8.1.2_@capacitor+core@8.3.1\node_modules\@capacitor\filesystem"),
        .package(name: "CapacitorLocalNotifications", path: "..\..\..\node_modules\.pnpm\@capacitor+local-notifications@8.0.2_@capacitor+core@8.3.1\node_modules\@capacitor\local-notifications"),
        .package(name: "CapacitorNetwork", path: "..\..\..\node_modules\.pnpm\@capacitor+network@8.0.1_@capacitor+core@8.3.1\node_modules\@capacitor\network"),
        .package(name: "CapacitorPreferences", path: "..\..\..\node_modules\.pnpm\@capacitor+preferences@8.0.1_@capacitor+core@8.3.1\node_modules\@capacitor\preferences"),
        .package(name: "CapacitorPushNotifications", path: "..\..\..\node_modules\.pnpm\@capacitor+push-notifications@8.0.3_@capacitor+core@8.3.1\node_modules\@capacitor\push-notifications"),
        .package(name: "CapacitorSplashScreen", path: "..\..\..\node_modules\.pnpm\@capacitor+splash-screen@8.0.1_@capacitor+core@8.3.1\node_modules\@capacitor\splash-screen"),
        .package(name: "CapacitorStatusBar", path: "..\..\..\node_modules\.pnpm\@capacitor+status-bar@8.0.2_@capacitor+core@8.3.1\node_modules\@capacitor\status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseAuthentication", package: "CapacitorFirebaseAuthentication"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
