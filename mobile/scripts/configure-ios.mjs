import fs from "node:fs";
import path from "node:path";

const root = path.resolve("ios/App");
const plist = path.join(root, "App/Info.plist");
const project = path.join(root, "App.xcodeproj/project.pbxproj");
const entitlements = path.join(root, "App/App.entitlements");
if (!fs.existsSync(plist) || !fs.existsSync(project)) {
  throw new Error("iOS project missing. Run npm run build && npm run ios:add first.");
}
let info = fs.readFileSync(plist, "utf8");
if (!info.includes("NSHealthShareUsageDescription")) {
  const insert = [
  "<dict>",
  "<key>NSHealthShareUsageDescription</key>",
  "<string>VYRA читает шаги, сон, тренировки и дистанцию из Apple Здоровья для обновления RPG-квестов и опыта. Данные остаются на устройстве.</string>",
  "<key>NSHealthUpdateUsageDescription</key>",
  "<string>VYRA не записывает данные в Apple Здоровье: приложение использует только чтение.</string>"
  ].join("\n");
  info = info.replace("<dict>", insert);
}
fs.writeFileSync(plist, info);
fs.writeFileSync(entitlements, [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0"><dict><key>com.apple.developer.healthkit</key><true/></dict></plist>'
].join("\n"));
let pbx = fs.readFileSync(project, "utf8");
if (!pbx.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")) {
  const regex = /(\bPRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;)/g;
  const count = (pbx.match(regex)||[]).length;
  if (count < 2) throw new Error("Could not find app Bundle Identifier build settings");
  pbx = pbx.replace(regex, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\t$1");
}
fs.writeFileSync(project, pbx);
// Create a real VYRA home-screen icon rather than Capacitor's placeholder.
const iconSource = path.resolve("public/vyra-app-icon.png");
const iconFolder = path.join(root, "App/Assets.xcassets/AppIcon.appiconset");
if (fs.existsSync(iconSource)) {
  const { execFileSync } = await import("node:child_process");
  fs.mkdirSync(iconFolder, { recursive: true });
  execFileSync("sips", [
    "-z", "1024", "1024", iconSource,
    "--out", path.join(iconFolder, "AppIcon.png")
  ], { stdio: "ignore" });
  const contents = {
    images: [{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
    info: { author: "xcode", version: 1 }
  };
  fs.writeFileSync(path.join(iconFolder, "Contents.json"), JSON.stringify(contents,null,2));
}
console.log("VYRA HealthKit entitlement, privacy keys and app icon configured");
