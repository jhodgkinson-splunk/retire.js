/*jshint esversion: 6 */

import { ConfigurableLogger, Hasher, Logger, LoggerOptions, Writer } from "../reporting";

import * as retire from "../retire";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Finding } from "../types";

function configureCycloneDXLogger(logger: Logger, writer: Writer, config: LoggerOptions, hash: Hasher) {
    let vulnsFound = false;
    const finalResults = {
      version: retire.version,
      start: new Date(),
      data: [] as Finding[],
      messages: [] as unknown[],
      errors: [] as unknown[]
    };
    logger.info = finalResults.messages.push;
    logger.debug = config.verbose ? finalResults.messages.push : () => { return };
    logger.warn = logger.error = finalResults.errors.push;
    logger.logVulnerableDependency = function(finding) {
        vulnsFound = true;
        finalResults.data.push(finding);
    };
    logger.logDependency = function(finding) {
        if (finding.results.length > 0) {
          finalResults.data.push(finding);
        }
    };

    logger.close = function(callback) {
      const write = vulnsFound ? writer.err : writer.out;
      const seen = new Set<string>();
      const components = finalResults.data.filter(d => d.results).map(r => r.results.map(dep => {
          dep.version = (dep.version.split(".").length >= 3 ? dep.version : dep.version + ".0").replace(/-/g, ".");
          const filepath = r.file;
          let hashes = "";
          if (filepath) {
            const file = fs.readFileSync(filepath);
              hashes = `
          <hashes>
            <hash alg="MD5">${hash.md5(file)}</hash>
            <hash alg="SHA-1">${hash.sha1(file)}</hash>
            <hash alg="SHA-256">${hash.sha256(file)}</hash>
            <hash alg="SHA-512">${hash.sha512(file)}</hash>
          </hashes>`;
          }
          const purl = `pkg:npm/${dep.component}@${dep.version}`;
          if (seen.has(purl)) return '';
          seen.add(purl);
          return `
    <component type="library">
      <name>${dep.component}</name>
      <version>${dep.version}</version>${hashes}
      <purl>${purl}</purl>
      <modified>false</modified>
    </component>`;
    }).join("")).join("");
        write(`<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.4" serialNumber="urn:uuid:${ uuidv4() }" version="1">
  <metadata>
    <timestamp>${finalResults.start.toISOString()}</timestamp>
    <tools>
        <tool>
            <vendor>RetireJS</vendor>
            <name>retire.js</name>
            <version>${ retire.version }</version>
        </tool>
    </tools>
  </metadata>
  <components>${components}
  </components>
</bom>`);
        writer.close(callback);
    };
}

export default {
  configure: configureCycloneDXLogger
} as  ConfigurableLogger;
