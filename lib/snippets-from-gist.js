'use babel';

import { CompositeDisposable } from 'atom';
import fs from 'fs';
import path from 'path';
import request from 'request-promise';

export default {

  subscriptions: null,

  config: {
    "gistRepository": {
      type: "string",
      default: "https://gist.github.com",
      description: "Please type the gist repository of your gist here."
    }
  },

  activate(state) {

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'snippets-from-gist:pull': () => this.pull()
    }));


  },

  deactivate() {
  },

  /**
   * Pull snippets from Gist repository
   * @return null
   */
  pull() {
    const gistRepository = atom.config.get('snippets-from-gist.gistRepository');
    const gistRepositoryInfo = gistRepository.replace(/\\/g, '/').split('/');
    const gistHash = gistRepositoryInfo[gistRepositoryInfo.length - 1];
    const gitUser = gistRepositoryInfo[gistRepositoryInfo.length - 2];
    const userConfigDir = atom.config.getUserConfigPath().replace(/[\\|/]config\.cson$/, '');
    const snippetFile = `${userConfigDir}${path.sep}snippets.cson`;

    // console.log('gistRepository: ', gistRepository);
    // console.log('gistHash: ', gistHash);
    // console.log('gitUser: ', gitUser);
    // console.log('userConfigDir: ', userConfigDir);
    // console.log('snippetFile: ', snippetFile);

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0; // disable ssl cert error
    request({
      uri: `https://api.github.com/users/${gitUser}/gists`,
      headers: {
        'User-Agent': 'Request-Promise'
      }
    }).then((gists) => {
      gists = JSON.parse(gists);

      // console.log(gists);
      // console.log(typeof(gists));

      for(const gist of gists) {
        if(gist.id === gistHash) {
          let gistFilePromises = [];
          for(const gistFile of Object.values(gist.files)) {
            gistFilePromises.push(request({
              uri: gistFile.raw_url,
              headers: {
                'User-Agent': 'Request-Promise'
              }
            }));
          }

          Promise.all(gistFilePromises).then((snippets) => {
            let sources = {};
            // group the snippets
            for(let snippet of snippets) {
              const source = snippet.split('\n')[0].replace(/:/, '');
              // check if valid source type
              if(/\.([a-z]+\.)*/.test(source)) {
                // valid source type -> add source type if not exists
                if(!(source in sources)) {
                  sources[source] = '';
                }

                // extract the content and append to same source content
                snippet = snippet.split('\n');
                snippet = snippet.slice(1, snippet.length).join('\n');
                sources[source] = `${sources[source]}${snippet}\n`;
              }
            }

            // serialize the contents to a single file
            let snippetContent = '';
            for(const idx in sources) {
              snippetContent = `${snippetContent}\n${idx}:\n${sources[idx]}\n`;
            }

            // console.log(snippetContent);

            // write to file
            fs.writeFile(`${userConfigDir}${path.sep}snippets.cson`, snippetContent.trim(), (err) => {
              // console.warn('write file done');
              if(err) {
                // console.error(err);
                atom.notifications.addError(err.toString(), {});
                return;
              }
              atom.notifications.addSuccess(`Snippets are pulled from Gist`, {});
            });
          });
        }
      }
    }).catch((err) => {
      // error
      // console.error(err);
      atom.notifications.addError(err.toString(), {});
    });
  }

};
