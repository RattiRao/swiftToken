// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "SF49ersDesignTokens",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15),
        .tvOS(.v13),
        .watchOS(.v6)
    ],
    products: [
        .library(
            name: "SF49ersDesignTokens",
            targets: ["SF49ersDesignTokens"]),
    ],
    dependencies: [
        // Add any dependencies here if needed
    ],
    targets: [
        .target(
            name: "SF49ersDesignTokens",
            dependencies: [],
            path: "figma-tokens/design_tokens/swift"),
    ]
)
