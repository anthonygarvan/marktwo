import React from 'react';
import moment from 'moment';
import Shelf from './Shelf';
import shortid from 'shortid';
import Doc from './Doc';
import './MarkTwo.scss';
import marked from 'marked';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import syncUtils from './syncUtils';
import { faTimes, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import download from 'in-browser-download';
import raw from 'raw.macro';
import _ from 'lodash';
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

    marked.setOptions({
      breaks: true,
      smartLists: true,
    });

    this.state = {
      gapi: this.props.gapi,
      searchString: '',
      searchResults: [],
      showShelf: false,
    };

  }

  componentDidMount() {
    this.syncUtils = syncUtils(this.state.gapi);
    this.appDataKey = `appData_${this.props.userEmail}`;
    const currentDoc = shortid.generate();
    const defaultAppData = { currentDoc,
      docs: [ {id: currentDoc, title: false, lastModified: new Date()} ],
      revision: 0 };

    if(!this.props.tryItNow) {
      this.syncUtils.initializeData(this.appDataKey, defaultAppData).then(appData => {
        this.sync(appData);
      });
    } else {
      this.setState({ ...defaultAppData, appData: defaultAppData });
    }
  }

  sync(appData, additionalState) {
    this.setState({ ...appData, ...additionalState, appData });
    if(!this.props.tryItNow) {
      this.syncUtils.syncByRevision(this.appDataKey, appData).then(appData => {
        this.setState({ ...appData, appData })
      });
    }
  }

  openFile(id) {
    this.setState({ currentDoc: false }, () => {
      const appData = _.cloneDeep(this.state.appData);
      appData.currentDoc = id;
      this.sync(appData, { showDocs: false, showShelf: false, initialData: false });
    })
  }

  startNewFile() {
    this.setState({ currentDoc: false }, () => {
      const appData = _.cloneDeep(this.state.appData);
      const id = shortid.generate();
      appData.currentDoc = id;
      appData.docs.unshift({ id, title: false, lastModified: new Date() });
      this.sync(appData, { showDocs: false, initialData: false, showShelf: false });
    })
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

  deleteFile(fileName) {
    const appData = _.cloneDeep(this.state.appData);
    appData.docs = appData.docs.filter(file => file.id !== fileName);
    if(this.state.currentDoc === fileName) {
      if(appData.docs.length) {
        appData.currentDoc = appData.docs[0].id;
      } else {
        const id = shortid.generate();
        appData.currentDoc = id;
        appData.docs.unshift({ id, title: false, lastModified: new Date() });
      }
    }
    this.sync(appData, {});
    this.syncUtils.find(fileName, docMetadata => {
      this.syncUtils.deleteFiles(docMetadata.pageIds).then(results => {
        this.syncUtils.deleteFile(fileName)
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
            this.sync(appData, { initialData: e.target.result, showDocs: false, showShelf: false });
          })
        }
        reader.readAsText(e.target.files[0]);
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
    const exactMatchRegex = /^"(.+)"$/
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
    const searchResults = this.state.allLines.filter(id => searchRegex.test(this.state.doc[id])).map(id => ({ id, text: this.state.doc[id] }))

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
        const text = this.state.allLines.map(id => this.state.doc[id]).join('\n\n');
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

  render() {
    return <div>
    {this.state.currentDoc && <Doc key={this.state.currentDoc}
      currentDoc={this.state.currentDoc}
      gapi={this.props.gapi}
      handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      tryItNow={this.props.tryItNow}
      initialData={!this.props.tryItNow ? this.state.initialData : tryItNowText}
      goToBlock={this.state.goToBlock}
      setDocData={(allLines, doc) => this.setState({ allLines, doc })} /> }
    <Shelf handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      gapi={this.props.gapi}
      tryItNow={this.props.tryItNow}
      showShelf={this.state.showShelf}
      setShelf={(val) => this.setState({ showShelf: val })}
      showDocs={(val) => this.setState({ showDocs: val, viewArchive: false })}
      showSearch={() => this.setState({ showSearch: true })}
      showAbout={() => this.setState({ showAbout: true })}/>

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
            dangerouslySetInnerHTML={ { __html: marked(r.text) } }>
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
            <span className="button is-text is-clear">Import</span>
            <input type="file" onChange={this.handleImport} accept=".txt,.md" />
          </label>
          <button className="button is-outline" onClick={this.startNewFile}>New</button></div>
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
                      <select value={''} onChange={(e) => this.takeFileAction(e, f)}>
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

          <p>MarkTwo is my second attempt at a markdown editor, and obviously my best. </p>

          <div className="m2-me"><img src="/img/me.jpg" alt="developer" /></div>
      </section>
      <footer className="modal-card-foot">
        <a href="/privacy.txt" target="_blank">Privacy</a>
        <a href="/terms.txt" target="_blank">Terms</a>
        <a href="https://github.com/anthonygarvan/marktwo" target="_blank">Source</a>
    </footer>
    </div></div>}


  </div>
  }
}

export default MarkTwo
