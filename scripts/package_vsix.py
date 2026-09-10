#!/usr/bin/env python3
from pathlib import Path
import json
import zipfile
import html

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

name = manifest["name"]
version = manifest["version"]
publisher = manifest["publisher"]
display_name = manifest.get("displayName", name)
description = manifest.get("description", "")
engine = manifest["engines"]["vscode"]
categories = ",".join(manifest.get("categories", []))
extension_kind = ",".join(manifest.get("extensionKind", []))

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
out = dist / f"{name}-{version}.vsix"

vsix_manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0"
    xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"
    xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US"
              Id="{html.escape(name)}"
              Version="{html.escape(version)}"
              Publisher="{html.escape(publisher)}" />
    <DisplayName>{html.escape(display_name)}</DisplayName>
    <Description xml:space="preserve">{html.escape(description)}</Description>
    <Categories>{html.escape(categories)}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{html.escape(engine)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="{html.escape(extension_kind)}" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest"
           Path="extension/package.json"
           Addressable="true" />
  </Assets>
</PackageManifest>
'''

content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
'''

files = [
    "package.json",
    "src/extension.js",
    "media/viewer.js",
    "media/viewer.css",
    "README.md",
    "LICENSE",
]

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("extension.vsixmanifest", vsix_manifest)
    for rel in files:
        z.write(ROOT / rel, f"extension/{rel}")

print(out)
