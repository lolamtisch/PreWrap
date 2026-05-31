const regExpReplacement: Record<string, string> = {
  'Amazon': '([a-z0-9-]+[.])*amazon([.][a-z]+)+[/]',
  'eggsy.codes': 'eggsy[.]xyz',
  'IDLIX': '(((tv([0-9]?))?(vip)?[.])?id(f)?lix(official)?[.][a-z]{2,6})',
  'Naver': '((section)[.])?([a-z]+)[.]naver[.]([a-z0-9]+)',
}


import "source-map-support/register";

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { sync as glob } from "glob";
import { valid } from "semver";
import { execSync } from "child_process";

const activitiesRoot = "./Activities",
  metadataGlobs = [
    `${activitiesRoot}/websites/*/*/metadata.json`,
    `${activitiesRoot}/websites/*/*/v*/metadata.json`,
  ];

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
  compile = () => {
    execSync("npm run prepare", { cwd: activitiesRoot, stdio: "inherit" });

    try {
      execSync("node ./node_modules/pmd/dist/index.js build --all --kill=false", {
        cwd: activitiesRoot,
        stdio: "inherit",
      });
    } catch {
      console.error(
        "Activity build completed with errors; continuing with available dist output..."
      );
    }
  },
  activityPathFromMetadata = (metadataPath: string): string =>
    `${dirname(metadataPath).replace(/\\/g, "/")}/`,
  selectLatestActivities = (
    activities: Array<[Metadata, string]>
  ): Array<[Metadata, string]> => {
    const latest = new Map<string, [Metadata, string]>();

    activities.forEach((activity) => {
      const [metadata] = activity,
        current = latest.get(metadata.service),
        apiVersion = metadata.apiVersion || 1,
        currentApiVersion = current ? current[0].apiVersion || 1 : 0;

      if (!current || apiVersion >= currentApiVersion)
        latest.set(metadata.service, activity);
    });

    return [...latest.values()];
  },
  main = async (): Promise<void> => {
    if (!process.env.GITHUB_ACTIONS)
      console.log(
        "\nPlease note that this script is ONLY supposed to run on a CI environment"
      );

    console.log("\nFETCHING...\n");

    const activities: Array<[Metadata, string]> = metadataGlobs
        .flatMap((pattern) => glob(pattern))
        .map((metadataPath) => {
          const activityPath = activityPathFromMetadata(metadataPath),
            file = readFile(metadataPath);

          if (isValidJSON(file)) {
            const data = JSON.parse(file) as Metadata;
            delete data["$schema"];
            return [data, activityPath] as [Metadata, string];
          } else {
            console.error(
              `Error. Folder ${activityPath} does not include a valid metadata file, skipping...`
            );
            return null;
          }
        })
        .filter((activity): activity is [Metadata, string] => activity !== null),
      dbDiff = selectLatestActivities(activities);

    if (dbDiff.length > 0) console.log("\nCOMPILING...\n");

    compile();

    const compiledActivities = (await Promise.all(
      dbDiff.map(async (file) => {
        let metadata = file[0];
        const path = file[1],
          distPath = `${path}dist/`,
          metadataFile = readJson<Metadata>(`${path}metadata.json`);

        console.log('Getting', path);

        if (!metadata && !metadataFile) {
          console.error(
            `Error. No metadata was found for ${path}, skipping...`
          );
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
          return null;
        }

        if (!existsSync(`${distPath}presence.js`)) {
          const meta = metadataFile.service ? metadataFile.service : path;
          console.error(`Error. ${meta} did not compile, skipping...`);
          return null;
        }

        const resJson: DBdata = {
          name: metadata.service,
          url: `https://api.premid.app/v2/presences/${encodeURIComponent(
            metadata.service
          )}/`,
          metadata,
          presenceJs: readFileSync(`${distPath}presence.js`, "utf-8")
        };

        if (metadata.iframe && existsSync(`${distPath}iframe.js`))
          resJson.iframeJs = readFileSync(`${distPath}iframe.js`, "utf-8");
        else if (metadata.iframe && !existsSync(`${distPath}iframe.js`)) {
          console.error(
            `Error. ${metadata.service} explicitly includes iframe but no such file was found, skipping...`
          );
          return null;
        } else if (!metadata.iframe && existsSync(`${distPath}iframe.js`)) {
          console.error(
            `Error. ${metadata.service} contains an iframe file but does not include it in the metadata, skipping...`
          );
          return null;
        }

        return resJson;
      })
    )).filter((el): el is DBdata => el !== null);

    console.log("\nUPDATING...\n");

    try {
      const metad: any[] = [];

      if(compiledActivities.length < 100) throw `Less than 100 Activities (${compiledActivities.length})`;

      compiledActivities.forEach((el) => {
        const pageDir = el.name;

        console.log(`./Extension/Pages/${pageDir}/index.js`);

        if (!existsSync(`./Extension/Pages/${pageDir}`)) {
          mkdirSync(`./Extension/Pages/${pageDir}`, { recursive: true });
        }

        const iframeMode = el.metadata.iframe ? 'var checkIframe = true;' : '';

        writeJS(
          `./Extension/Pages/${pageDir}/index.js`,
          iframeMode+' var serviceNameWrap="'+el.name+'"; var mCategory = "' + el.metadata.category + '"; \n' + el.presenceJs
        );
        if (el.iframeJs) writeJS(`./Extension/Pages/${pageDir}/iframe.js`, el.iframeJs);

        delete el.metadata.description;
        delete (el.metadata as Partial<Metadata>).version;

        if (el.metadata.regExp) {
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
            el.metadata.regExp = regExpReplacement[el.name];
          }
        }

        metad.push(el.metadata);
      })

      writeJS(`./Extension/Pages/pages.js`, 'var pages = '+JSON.stringify(metad, null, 2));

    } catch (err) {
      console.error(err instanceof Error ? err.stack || err.message : err);
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
  service: string;
  version: string;
  apiVersion?: number;
  category?: string;
  iframe?: boolean;
  regExp?: string;
  description?: Record<string, string>;
  [key: string]: any;
}

interface DBdata {
  name: string;
  url: string;
  metadata: Metadata;
  presenceJs: string;
  iframeJs?: string;
}
