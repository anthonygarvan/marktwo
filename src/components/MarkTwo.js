import React from 'react';
import moment from 'moment';
import Shelf from './Shelf';
import shortid from 'shortid';
import Doc from './Doc';
import './MarkTwo.scss';
import marked from 'marked';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import syncUtils from './syncUtils';
import syncUtilsOffline from './syncUtilsOffline';
import { faTimes, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import download from 'in-browser-download';
import raw from 'raw.macro';
import _ from 'lodash';
import $ from 'jquery';
import { get, set } from 'idb-keyval';
import me from '../img/me.jpg';
import coffee from '../img/coffee.png';
import { faBolt, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import 'typeface-roboto-slab';
const tryItNowText  = raw('./tryItNow.md');




class MarkTwo extends React.Component {
  constructor(props) {
    super(props);

    this.openFile = this.openFile.bind(this);
    this.startNewFile = this.startNewFile.bind(this);
    this.handleImport = this.handleImport.bind(this);
    this.toggleArchive = this.toggleArchive.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
    this.takeFileAction = this.takeFileAction.bind(this);
    this.sync = this.sync.bind(this);
    this.refreshDocs = this.refreshDocs.bind(this);
    this.setOfflineMode = this.setOfflineMode.bind(this);
    this.setDarkMode = this.setDarkMode.bind(this);
    this.handleViewImageFolder = this.handleViewImageFolder.bind(this);
    this.handleMentionOrHashtagSearch = this.handleMentionOrHashtagSearch.bind(this);

    window.handleMentionOrHashtagSearch = this.handleMentionOrHashtagSearch;

    marked.setOptions({
      breaks: true,
      smartLists: true,
    });

    this.state = {
      gapi: this.props.gapi,
      searchString: '',
      searchResults: [],
      showShelf: false,
      darkMode: false,
      offlineMode: false,
      spellcheck: true,
      serif: false,
    };

  }

  componentDidMount() {
    this.appDataKey = `appData_${this.props.userEmail}`;
    get('offlineMode').then(offlineMode => {
      offlineMode = !this.props.tryItNow ? ((offlineMode && JSON.parse(offlineMode)) || !this.state.gapi) : false;
      this.setState({ offlineMode }, () => {
        this.syncUtils = this.state.offlineMode ? syncUtilsOffline() : syncUtils(this.state.gapi);
        const currentDoc = shortid.generate();
        const defaultAppData = { currentDoc,
          docs: [ {id: currentDoc, title: false, lastModified: new Date()} ],
          revision: 0,
          signUpDate: new Date()};

        if(!this.props.tryItNow) {
          this.refreshDocs(defaultAppData);
        } else {
          this.setState({ ...defaultAppData, appData: defaultAppData });
        }

        get('darkMode').then(value => value && this.setDarkMode(JSON.parse(value)));
        get('spellcheck').then(value => value && this.setSpellcheck(JSON.parse(value)));
        get('serif').then(value => value && this.setSerif(JSON.parse(value)));
        get('signUpDate').then(value => !value && set('signUpDate', JSON.stringify(new Date())));
      });
    })
  }

  refreshDocs(defaultAppData) {
    return new Promise(resolve => {
        (this.props.tryItNow ? new Promise(resolve => resolve(_.clone(this.state.appData)))
        : this.syncUtils.initializeData(this.appDataKey, defaultAppData)).then(appData => {
          Promise.all(appData.docs.map(d => {
            return get(d.id)
          })).then(docMetaDataFiles => {
            appData.docs = appData.docs.map((d, i) => {
              d.lastModified = docMetaDataFiles[i] ? JSON.parse(docMetaDataFiles[i]).lastModified : d.lastModified;
              return d;
            })
            this.sync(appData, {}).then(resolve);
          });
          });
      });
  }

  sync(appData, additionalState) {
    if(!this.syncing) {
      console.log(`starting sync: ${JSON.stringify(appData)}`);
      this.syncing = true;
      this.setState({ ...appData, ...additionalState, appData });
      return new Promise(resolve => {
        if(!this.props.tryItNow) {
          this.syncUtils.syncByRevision(this.appDataKey, appData).then(appData => {
            console.log(`finished sync: ${JSON.stringify(appData)}`);
            this.setState({ ...appData, appData }, () => {
              this.syncing = false;
              resolve();
            });
          });
        } else {
          this.syncing = false;
          resolve();
        }
      })
    } else {
      setTimeout(() => this.sync(appData, additionalState), 200);
    }
  }

  openFile(id) {
    this.setState({ currentDoc: false }, () => {
      $(window).scrollTop(0);
      const appData = _.cloneDeep(this.state.appData);
      appData.currentDoc = id;
      this.sync(appData, { showDocs: false, showShelf: false, initialData: false });
    })
  }

  startNewFile() {
    console.log(`old doc: ${JSON.stringify(this.state.currentDoc)}`);
    this.setState({ currentDoc: false }, () => {
      console.log(`current doc: ${JSON.stringify(this.state.currentDoc)}`);
      $(window).scrollTop(0);
      const appData = _.cloneDeep(this.state.appData);
      const id = shortid.generate();
      appData.currentDoc = id;
      appData.docs.unshift({ id, title: false, lastModified: new Date() });
      this.sync(appData, { showDocs: false, initialData: false, showShelf: false });
    })
  }

  deleteFile(fileName) {
    const currentDoc = this.state.currentDoc;
    this.setState({ currentDoc: false }, () => {
      const appData = _.cloneDeep(this.state.appData);
      appData.docs = appData.docs.filter(file => file.id !== fileName);
      if(currentDoc === fileName) {
        if(appData.docs.length) {
          appData.currentDoc = appData.docs[0].id;
        } else {
          const id = shortid.generate();
          appData.currentDoc = id;
          appData.docs.unshift({ id, title: false, lastModified: new Date() });
        }
      }
      this.sync(appData, { initialData: false });
      !this.props.tryItNow && this.syncUtils.find(fileName, docMetadata => {
        this.syncUtils.deleteFiles(docMetadata.pageIds).then(results => {
          this.syncUtils.deleteFile(fileName)
        })
      })
  })
  }

  handleImport(e) {
    const reader = new FileReader();
        reader.onload = (e) => {
          const appData = _.cloneDeep(this.state.appData);
          const id = shortid.generate();
          appData.currentDoc = id;
          appData.docs.unshift({ id, title: false, lastModified: new Date() });
          this.setState({ currentDoc: false }, () => {
            $(window).scrollTop(0);
            this.sync(appData, { initialData: e.target.result, showDocs: false, showShelf: false });
          })
        }
        reader.readAsText(e.target.files[0]);
  }

  setTitle(id, title) {
    const appData = _.cloneDeep(this.state.appData);
    appData.file = appData.docs.map(f => {
      if(f.id === id) {
        f.title = title;
      }
    });
    this.sync(appData, {});
  }

  toggleArchive(id) {
    const appData = _.cloneDeep(this.state.appData);
    appData.file = appData.docs.map(f => {
      if(f.id === id) {
        f.archived = !f.archived;
      }
    });
    this.sync(appData, { newTitle: false, editTitle: false });
  }

  handleSearch(e) {
    e.preventDefault();
    console.log(this.state.searchString);
    let searchResults;
    if(!this.state.searchString) {
      searchResults = this.state.allLines.filter(id => this.state.doc[id].startsWith('// ')).map(id => ({ id, html: this.state.doc[id].replace('// ', '') })).slice(0, 1000)
    } else if(/^#todo$/i.test(this.state.searchString)) {
      let searchRegex = /(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]\s/;
      searchResults = this.state.allLines.filter(id => searchRegex.test(this.state.doc[id])).map(id => ({ id, html: marked(this.state.doc[id]).replace(searchRegex, (m) => `<mark>${m}</mark>`) })).slice(0, 1000);
    } else {
      const exactMatchRegex = /^"(.+)"$/;
      let searchRegex;
      if(exactMatchRegex.test(this.state.searchString)) {
        searchRegex = new RegExp(this.state.searchString
            .match(exactMatchRegex)[1].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'ig');
      } else {
        const keywords = this.state.searchString.split(' ')
                .map(t => t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')) // comment out regex expressions
        searchRegex = new RegExp(keywords.join('|'), 'ig');
      }
      const whitespaceRegex = new RegExp('^[\\s\\n]*$')
      searchResults = this.state.allLines.filter(id => searchRegex.test(this.state.doc[id])).map(id => ({ id, html: marked(this.state.doc[id]).replace(searchRegex, (m) => `<mark>${m}</mark>`) })).slice(0, 1000)
    }
    this.setState({ searchResults });
  }

  takeFileAction(e, file) {
    switch(e.target.value) {
      case 'rename':
          var newTitle = prompt('Please select a new file name:')
          if(newTitle) {
            this.setTitle(file.id, newTitle)
          }
          break;
      case 'export':
        let lastTag;
        const blocks = [];
        this.state.allLines.forEach((id, i) => {
          const nextTag = $(marked(this.state.doc[id])).length && $(marked(this.state.doc[id]))[0].tagName;
          if(lastTag === 'P' && nextTag === 'P') {
            blocks.push('\n' + this.state.doc[id]);
          } else {
            blocks.push(this.state.doc[id]);
          }
          lastTag = nextTag;
        })

        const text = blocks.join('\n');
        const title = this.state.docs.filter(f => f.id === this.state.currentDoc).title || 'Untitled';
        download(text, `${title}.txt`);
        break;
      case 'toggleArchive':
        this.toggleArchive(file.id);
        break;
      case 'delete':
        const confirmed = window.confirm(`Permanently delete ${file.title || 'Untitled'}?`)
        if(confirmed) {
          this.deleteFile(file.id);
        }
        break;
    }
  }

  setDarkMode(value) {
    this.setState({ darkMode: value }, () => {
      this.state.darkMode ? $('body').addClass('m2-dark-mode') : $('body').removeClass('m2-dark-mode');
      set('darkMode', JSON.stringify(value));
    })
  }

  setOfflineMode(value, callback) {
    return new Promise(resolve => {
      this.setState({ offlineMode: value }, () => {
        this.syncUtils = this.state.offlineMode ? syncUtilsOffline() : syncUtils(this.state.gapi);
        set('offlineMode', JSON.stringify(value)).then(resolve);
      })
    })
  }

  setSpellcheck(value, callback) {
    return new Promise(resolve => {
      this.setState({ spellcheck: value }, () => {
        set('spellcheck', JSON.stringify(value)).then(resolve);
        $('body').attr('spellcheck', this.state.spellcheck);
      })
    })
  }

  setSerif(value, callback) {
    return new Promise(resolve => {
      this.setState({ serif: value }, () => {
        set('serif', JSON.stringify(value)).then(resolve);
        if(this.state.serif) {
          $('#m2-doc').addClass('m2-serif');
        } else {
          $('#m2-doc').removeClass('m2-serif');
        }
      })
    })
  }

  handleViewImageFolder(e) {
    this.syncUtils.getImagesFolder().then(id => {
      window.open(`https://drive.google.com/drive/u/0/folders/${id}`, '_blank')
    });
  }

  handleMentionOrHashtagSearch(mentionOrHashtag) {
    this.setState({ searchString: mentionOrHashtag, showSearch: true }, () => {
      this.handleSearch({ preventDefault: () => {} });
    })
  }

  render() {
    return <div>
    {this.state.currentDoc && <Doc key={this.state.currentDoc}
      currentDoc={this.state.currentDoc}
      gapi={this.props.gapi}
      handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      handleLogin={this.props.handleLogin}
      tryItNow={this.props.tryItNow}
      initialData={this.state.initialData || (this.props.tryItNow && tryItNowText)}
      goToBlock={this.state.goToBlock}
      setDocData={(allLines, doc) => this.setState({ allLines, doc })}
      offlineMode={this.state.offlineMode}
      spellcheck={this.state.spellcheck} /> }
    <Shelf handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      gapi={this.props.gapi}
      tryItNow={this.props.tryItNow}
      offlineMode={this.state.offlineMode}
      showShelf={this.state.showShelf}
      setShelf={(val) => this.setState({ showShelf: val })}
      showDocs={(val) => this.setState({ showDocs: val, viewArchive: false }, this.refreshDocs)}
      showSearch={() => this.setState({ showSearch: true }, () => this.handleSearch({ preventDefault: () => {}}))}
      showAbout={() => this.setState({ showAbout: true })}
      showHelp={() => this.setState({ showHelp: true })}
      showSettings={() => this.setState({ showSettings: true })}
      showContact={() => this.setState({ showContact: true })}/>

    {this.state.showSearch && <div className="m2-search modal is-active">
    <div className="modal-background" onClick={() => this.setState({ showSearch: false, searchString: '', searchResults: [] })}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">Search</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({showSearch: false, searchString: '', searchResults: [] })}></button>
      </header>
      <section className="modal-card-body">
        <form onSubmit={this.handleSearch}>
        <div className="field has-addons">
          <div className="control is-expanded">
            <input className="input is-fullwidth" type="search" placeholder="Search this doc"
            value={this.state.searchString} onChange={(e) => this.setState({ searchString: e.target.value })} />
          </div>
          <div className="control m2-search-button">
            <button type="submit" className="button is-primary">
              Search
            </button>
          </div>
        </div>
      </form>
        <div className="m2-search-results">
        {this.state.searchResults.length ? this.state.searchResults.map(r =>
          <div key={r.id} className="m2-search-result" onClick={() => this.setState({ goToBlock: r.id, showSearch: false, searchString: '', searchResults: [], showShelf: false })}
            dangerouslySetInnerHTML={ { __html: r.html } }>
          </div>) : <p><em>Didn't find anything...</em></p>}</div>
      </section>
    </div></div>}


    {this.state.showDocs && <div className="m2-docs modal is-active">
    <div className="modal-background" onClick={() => this.setState({showDocs: false})}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">Docs</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({showDocs: false})}></button>
      </header>
      <section className="modal-card-body">
        <div>
          <label className="m2-import">
            <span className="button is-text is-clear" disabled={this.state.offlineMode}>Import</span>
            <input type="file" onChange={this.handleImport} accept=".txt,.md" disabled={this.state.offlineMode} />
          </label>
          <button className="button is-outline" onClick={this.startNewFile}  disabled={this.state.offlineMode}>New</button></div>
        <table className="table is-striped is-fullwidth">
          <thead>
            <tr>
              <th></th>
              <th><abbr title="Filename">Filename</abbr></th>
              <th><abbr title="Last modified">Last modified</abbr></th>
            </tr>
          </thead>
          <tbody>
            {this.state.docs && this.state.docs.filter(f => (!!f.archived == this.state.viewArchive)).map(f =>
              <tr key={f.id}>
                <td><div className="select">
                      <select value={'default'} onChange={(e) => this.takeFileAction(e, f)}>
                        <option hidden value="default"></option>
                        <option value="rename">Rename</option>
                        {f.id === this.state.currentDoc && <option value="export">Export</option>}
                        <option value="toggleArchive">{!f.archived ? 'Archive' : 'Move to docs'}</option>
                        <option value="delete">Delete</option>
                      </select>
                    </div></td>
                  <td className={f.id === this.state.currentDoc ? 'm2-is-current-doc' : undefined}>
    <a onClick={() => this.openFile(f.id)}>{f.title ? <abbr title={f.title}>{f.title.substring(0,20)}</abbr>: 'Untitled'}</a></td>
                <td>{moment(f.lastModified).fromNow()}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="m2-footer">
          <a onClick={() => this.setState({ viewArchive: !this.state.viewArchive })}>{this.state.viewArchive ? 'View docs' : 'View archive'}</a>
        </div>
      </section>
    </div>
  </div>}

  {this.state.showSettings && <div className="m2-settings modal is-active">
  <div className="modal-background" onClick={() => this.setState({ showSettings: false })}></div>
    <div className="modal-card">
    <header className="modal-card-head">
      <p className="modal-card-title">Settings</p>
      <button className="delete" aria-label="close" onClick={() => this.setState({ showSettings: false })}></button>
    </header>
    <section className="modal-card-body">
      <div className="field">
        <input id="m2-dark-mode-switch" type="checkbox"
          name="m2-dark-mode-switch"
          className="switch"
          checked={this.state.darkMode}
          onChange={(e) => this.setDarkMode(e.target.checked)}/>
        <label htmlFor="m2-dark-mode-switch">Dark mode</label>
      </div>

      <div className="field">
        <input id="m2-offline-mode-switch" type="checkbox"
          name="m2-offline-mode-switch"
          className="switch"
          checked={this.state.offlineMode}
          onChange={(e) => this.setOfflineMode(e.target.checked)}/>
        <label htmlFor="m2-offline-mode-switch">Offline mode <FontAwesomeIcon icon={faBolt} /></label>
      </div>

      <div className="field">
        <input id="m2-spellcheck-switch" type="checkbox"
          name="m2-spellcheck-switch"
          className="switch"
          checked={this.state.spellcheck}
          onChange={(e) => this.setSpellcheck(e.target.checked)}/>
        <label htmlFor="m2-spellcheck-switch">Spellcheck</label>
      </div>

      <div className="field">
        <input id="m2-serif-switch" type="checkbox"
          name="m2-serif-switch"
          className="switch"
          checked={this.state.serif}
          onChange={(e) => this.setSerif(e.target.checked)}/>
        <label htmlFor="m2-serif-switch">Serif font</label>
      </div>

      <div className="field">
        <p><FontAwesomeIcon icon={faInfoCircle} />&nbsp;&nbsp;Images you upload via <code>/image</code> are served out of your Google Drive <a onClick={this.handleViewImageFolder}>here</a>.</p>
      </div>
    </section>
  </div></div>}

  {this.state.showContact && <div className="m2-contact modal is-active">
  <div className="modal-background" onClick={() => this.setState({ showContact: false })}></div>
    <div className="modal-card">
    <header className="modal-card-head">
      <p className="modal-card-title">Thanks for reaching out!</p>
      <button className="delete" aria-label="close" onClick={() => this.setState({ showContact: false })}></button>
    </header>
    <section className="modal-card-body">
      <p>I welcome bug reports, feature requests,
        questions, comments, complaints, gossip, tirades, manifestos, rants,
        and much more. I&apos;ll do my best to get back to you within two business days.</p>
      <br />
      <form name="m2-contact" method="post" action="/submitted">
        <input type="hidden" name="form-name" value="m2-contact" />

      <div className="field">
        <label className="label">Name</label>
        <div className="control">
          <input className="input" type="text" placeholder="Your name..." name="name" />
        </div>
      </div>

      <div className="field">
        <label className="label">Email</label>
        <div className="control">
          <input className="input" type="email" placeholder="your@email.com" name="email" />
        </div>
      </div>

      <div className="field">
        <label className="label">Message</label>
        <div className="control">
          <textarea className="textarea" placeholder="Your message..." name="message"></textarea>
        </div>
      </div>


      <div className="field is-grouped">
        <div className="control">
          <button type="submit" className="button is-link">Submit</button>
        </div>
        <div className="control">
          <button className="button is-text" onClick={() => this.setState({ showContact: false })}>Cancel</button>
        </div>
      </div>
    </form>
    </section>
  </div></div>}


    {this.state.showAbout && <div className="m2-about modal is-active">
    <div className="modal-background" onClick={() => this.setState({ showAbout: false })}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">About</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({ showAbout: false })}></button>
      </header>
      <section className="modal-card-body">
          <p>MarkTwo was created by me, Anthony Garvan. I&apos;m a software developer based out of Chicago.
            I love spending time with my family, working with my team, and tinkering with random projects like this one.</p>

          <p>MarkTwo is my second attempt at a markdown editor, and obviously my best. It took many months to get right,
            if you enjoy using it please consider showing your appreciation by buying me a cup of coffee ☕❤️.</p>
          <div className="m2-me"><img className="m2-profile" src={me} alt="developer" />
          <div>
          </div></div>
      </section>
      <footer className="modal-card-foot">
        <a href="/privacy.txt" target="_blank">Privacy</a>
        <a href="/terms.txt" target="_blank">Terms</a>
        <a href="https://github.com/anthonygarvan/marktwo" target="_blank">Source</a>
        <a className="m2-coffee is-pulled-right" href="https://www.buymeacoffee.com/GDsZofV" target="_blank">
          <img src={coffee} alt="Buy Me A Coffee"/></a>
    </footer>
    </div></div>}


    {this.state.showHelp && <div className="m2-help modal is-active">
    <div className="modal-background" onClick={() => this.setState({ showHelp: false })}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">Help</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({ showHelp: false })}></button>
      </header>
      <section className="modal-card-body content">
        <h2>General notes</h2>
        <p>Thanks for using MarkTwo!</p>
          <ul>
          <li>When you select a block (paragraph), it automatically transforms that HTML into markdown,
        and when you exit the block, it renders to HTML. Since Markdown can be multiline, you'll have to press enter twice to exit a block.</li>
      <li>MarkTwo continuously and efficiently syncs the document you're working via Google Drive. When the edit indicator bar turns light blue (or dark pink in dark mode), it means changes are being made.
      Once it turns dark blue (bright pink in dark mode), the changes are synced (a few seconds after you're done editing).</li>
          <li>We do not have access to your documents, they are as secure as your Google account (we recommend enabling two factor authentication).</li>
          <li>You can search for keywords, adding quotes matches "exact terms", and the special keyword #todo searches for all undone checklist tasks.</li>
        </ul>
        <h2>Writing with MarkTwo</h2>
        <p>MarkTwo supports most features of github flavored markdown.</p>
        <h5>Inline Formatting</h5>
        <pre>
{`Italics: *single asterisks* or _single underscores_
Bold: **double asterisks** or __double underscores__
Strikethrough: ~tildas~
Code: \`backticks\`
Links: [Text in brackets](https://link-in-parentheses.com)`}</pre>

<h5>Headers</h5>
<pre>
{`# One hash and a space for title header
## Two hashes makes a subheader

(3-6 hashes renders progressively smaller headers)`}
</pre>
<h5>Unorderd list</h5>
<pre>
{`- Dash or asterisk (*) followed by a space
- like this
    * Four spaces and a dash or asterisk starts a sub-list`}
</pre>

<h5>Ordered lists</h5>
<pre>
{`1. Any number followed by a period and space
1. The numbers themselves don't matter
    1. Again, four spaces starts a sub-list`}
</pre>

<h5>Todo lists and Reminders</h5>
<p>MarkTwo supports the standard syntax for todo lists. Additionally,
it supports reminders&mdash;when a not-done todo list item contains a reminder string,
you'll get a banner reminder when you load MarkTwo on or after that day. The format for a reminder string
is :reminder-ribbon: [date][semi-colon].</p>
<pre>
{`- [ ] A dash, a space, brackets with a space in between
- [x] An x in the middle marks it as done
- [ ] Reminders looks like this 🎗 July 2, 2024;`}
</pre>

<h5>Tables</h5>
<pre>
{`| Header1  | Header2 |
| -------  | ------- |
| entry 1  | entry2  |`}
</pre>

<h5>Block quotes</h5>
<pre>
{`> An angle bracket and a space will render a block quote.`}
</pre>

<h5>Code blocks</h5>
<pre>
{`\`\`\`
var success = "Text sandwiched by three backticks renders a code block";
\`\`\``}
</pre>

<h5>Horizontal Rule</h5>
<p>A line consisting solely of three or more dashes renders a horizontal rule.</p>
<pre>
{`---`}
</pre>

<h5>Bookmarks</h5>
<p>A line that starts with two slashes and a space gets rendered as a bookmark,
  and shows up by default in the <code>Search</code> view.</p>
<pre>
{`// January notes`}
</pre>

<h5>Images</h5>
<p>Link to images across the web with standard markdown syntax, or upload your own with the <code>/image</code> command.</p>
<pre>
{`![alt-text](https://images.com/image-url.png)
/image`}
</pre>

<h5>HTML</h5>
<p>The markdown spec is not intended to completely replace HTML. If you'd like a particular tag or style, you can just include it as HTML and it will render.
For example:
</p>
<pre>
{`Render highlighted text with the mark tag like <mark>this</mark>
And underlined text <u>like this</u>
<center>This will be centered</center>`}
</pre>

<h5>Text Tricks</h5>
<p>MarkTwo expands the strings <code>/today</code> and <code>/now</code> into the current date or date and time for your locale.
You can also use <code>/date</code> to bring up a date picker&mdash;this is especially handy when you're setting reminders.
Also, to make things easier to find later, <code>#hashtags</code> and <code>@mentions</code> autocomplete.
You can also search for and enter emojis with colons like this: <code>:emojis:</code></p>
<pre>{`# Star date: /today
#hashtags, @mentions
:smiley_face:`}</pre>
<p><b>That's it, enjoy!</b></p>
<p><br /></p>
      </section>
    </div></div>}
  </div>
  }
}

export default MarkTwo
