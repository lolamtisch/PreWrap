const regExpReplacement = {
  'Amazon': '([a-z0-9-]+[.])*amazon([.][a-z]+)+[/]',
  'eggsy.codes': 'eggsy[.]xyz',
}


import "source-map-support/register";

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { sync as glob } from "glob";
import {
  CompilerOptions,
  createProgram,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics
} from "typescript";
import { valid } from "semver";
import { join, normalize, resolve as rslv, sep } from "path";

let exitCode = 0,
  appCode = 0;

function isValidJSON(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const readFile = (path: string): string =>
    readFileSync(path, { encoding: "utf8" }),
  writeJS = (path: string, code: string): void =>
    writeFileSync(path, code, { encoding: "utf8", flag: "w" }),
  readJson = <T>(jsonPath: string): T => JSON.parse(readFile(jsonPath)) as T,
  compileFile = async (
    fileNames: string[],
    options: CompilerOptions
  ): Promise<void> => {
    // @ts-ignore
    options.module = 'CommonJS';
    delete options.moduleResolution;
    const program = createProgram(fileNames, options),
      emitResult = program.emit(),
      allDiagnostics = getPreEmitDiagnostics(program).concat(
        emitResult.diagnostics
      );

    allDiagnostics.forEach((diagnostic) => {
      if (diagnostic.file) {
        const {
            line,
            character
          } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!),
          message = flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        console.log(
          `${diagnostic.file.fileName} (${line + 1},${
            character + 1
          }): ${message}`
        );
      } else {
        console.log(flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      }
    });

    if (emitResult.emitSkipped) appCode = 1;
  },
  compile = async (filesToCompile: string[]): Promise<void> => {
    const premidTypings = join(__dirname, 'Presences', "@types", "premid", "index.d.ts"),
      { compilerOptions: baseTsConfig } = readJson<{
        compilerOptions: CompilerOptions;
      }>(rslv(__dirname, "./Presences/tsconfig.json"));

    for (const fileToCompile of filesToCompile) {
      const normalizedPath = normalize(fileToCompile).split(sep);
      normalizedPath.pop();

      const { compilerOptions: presenceConfig } = readJson<{
          compilerOptions: CompilerOptions;
        }>(rslv(normalizedPath.join(sep), "./../../../tsconfig.json")),
        tsConfig: CompilerOptions = {
          ...baseTsConfig,
          ...presenceConfig,
          outDir: rslv(normalizedPath.join(sep), "dist"),
          noEmitOnError: false,
          types: ["node"]
        };

      compileFile([fileToCompile, premidTypings], tsConfig);
    }
  },
  main = async (): Promise<void> => {
    if (!process.env.GITHUB_ACTIONS)
      console.log(
        "\nPlease note that this script is ONLY supposed to run on a CI environment"
      );

    console.log("\nFETCHING...\n");

    const presences: Array<[Metadata, string]> = glob("./Presences/{websites,programs}/*/*/")
        .filter((pF) => existsSync(`${pF}/metadata.json`))
        .map((pF) => {
          const file = readFile(`${pF}/metadata.json`);
          if (isValidJSON(file)) {
            const data = JSON.parse(file);
            delete data["$schema"];
            return [data, pF];
          } else {
            console.error(
              `Error. Folder ${pF} does not include a valid metadata file, skipping...`
            );
            exitCode = 1;
            return null;
          }
        }),
      dbDiff = presences;

    if (dbDiff.length > 0) console.log("\nCOMPILING...\n");

    const compiledPresences = await Promise.all(
      dbDiff.map(async (file) => {
        let metadata = file[0];
        const path = file[1],
          sources = glob(`${path}*.ts`),
          metadataFile = readJson<Metadata>(`${path}metadata.json`);

        console.log('Getting', path);

        appCode = 0;

        if (!metadata && !metadataFile) {
          console.error(
            `Error. No metadata was found for ${path}, skipping...`
          );
          appCode = 1;
          return null;
        } else if (!metadata && metadataFile) metadata = metadataFile;

        if (!path) return null;

        if (
          !metadataFile ||
          (metadataFile && valid(metadataFile.version) == null)
        ) {
          const meta =
            metadataFile && metadataFile.service
              ? metadataFile.service
              : metadata && metadata.service
              ? metadata.service
              : path;
          console.error(
            `Error. ${meta} does not include a valid metadata file/version, skipping...`
          );
          appCode = 1;
          return null;
        }

        await compile(sources);




        if (!existsSync(`${path}dist/presence.js`)) {
          const meta = metadataFile.service ? metadataFile.service : path;
          console.error(`Error. ${meta} did not compile, skipping...`);
          appCode = 1;
          return null;
        }

        const resJson: DBdata = {
          name: metadata.service,
          url: `https://api.premid.app/v2/presences/${encodeURIComponent(
            metadata.service
          )}/`,
          metadata,
          presenceJs: readFileSync(`${path}dist/presence.js`, "utf-8")
        };

        if (metadata.iframe && existsSync(`${path}dist/iframe.js`))
          resJson.iframeJs = readFileSync(`${path}dist/iframe.js`, "utf-8");
        else if (metadata.iframe && !existsSync(`${path}dist/iframe.js`)) {
          console.error(
            `Error. ${metadata.service} explicitly includes iframe but no such file was found, skipping...`
          );
          appCode = 1;
          return null;
        } else if (!metadata.iframe && existsSync(`${path}dist/iframe.js`)) {
          console.error(
            `Error. ${metadata.service} contains an iframe file but does not include it in the metadata, skipping...`
          );
          appCode = 1;
          return null;
        }

        if (appCode === 1) {
          if (exitCode === 0) exitCode = 1;
          metadata.service && metadata.service.length > 0
            ? console.log(`❌ ${metadata.service}`)
            : console.log(`❌ ${path}`);
        }

        return resJson;
      })
    );

    console.log("\nUPDATING...\n");

    try {
      const metad: any[] = [];

      if(compiledPresences.length < 100) throw 'Less than 100 Presences';
      compiledPresences.forEach((el) => {
        console.log(`./Extension/Pages/${el.name}/index.js`);

        if (!existsSync(`./Extension/Pages/${el.name}`)) {
          mkdirSync(`./Extension/Pages/${el.name}`);
        }

        var iframeMode = '';
        if(el.metadata.iframe) iframeMode = 'var checkIframe = true;';

        writeJS(
          `./Extension/Pages/${el.name}/index.js`,
          //@ts-ignore
          iframeMode+' var serviceNameWrap="'+el.name+'"; var mCategory = "' + el.metadata.category + '"; \n' + el.presenceJs
        );
        if (el.iframeJs) writeJS(`./Extension/Pages/${el.name}/iframe.js`, el.iframeJs);

        //@ts-ignore
        delete el.metadata.description;
        delete el.metadata.version;

        //@ts-ignore
        if (el.metadata.regExp) {
          //@ts-ignore
          const reg = el.metadata.regExp;
          if (
            reg.includes('(?=') ||
            reg.includes('(?!') ||
            reg.includes('(?<=') ||
            reg.includes('(?<!')
          ) {
            if (!regExpReplacement[el.name]) {
              console.log('Incompatible regex found ' + reg);
              throw 'Incompatible regex found ' + reg;
            }
            //@ts-ignore
            el.metadata.regExp = regExpReplacement[el.name];
          }
        }

        metad.push(el.metadata);
      })

      writeJS(`./Extension/Pages/pages.js`, 'export var pages = '+JSON.stringify(metad, null, 2));

    } catch (err) {
      console.error(err.stack || err);
      process.exit(1);
    }
  };

main();

process.on("unhandledRejection", (rejection) => {
  console.error(rejection);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error(err.stack || err);
  process.exit(1);
});

interface Metadata {
  schema: string;
  service: string;
  version: string;
  iframe?: boolean;
}

interface DBdata {
  name: string;
  url: string;
  metadata: Metadata;
  presenceJs: string;
  iframeJs?: string;
}
