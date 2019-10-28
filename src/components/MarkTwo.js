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

    const currentDoc = shortid.generate();
    const defaultAppData = { currentDoc,
      files: [ {id: currentDoc, title: false, lastModified: new Date()} ],
      revision: 0 };

    if(!this.props.tryItNow) {
      this.syncUtils.initializeData('appData', defaultAppData).then(appData => {
        this.sync(appData);
        this.setState({ ...appData });
      });
    } else {
      this.setState({ ...defaultAppData });
    }
  }

  sync(appData) {
    this.setState({ ...appData });
    if(!this.props.tryItNow) {
      this.syncUtils.syncByRevision('appData', appData);
    }
  }

  openFile(id) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.currentDoc = id;
    this.setState({ showFiles: false, showShelf: false });
    this.sync(appData);
  }

  startNewFile() {
   const appData = JSON.parse(localStorage.getItem('appData'));
   const id = shortid.generate();
   appData.currentDoc = id;
   appData.files.unshift({ id, title: false, lastModified: new Date() });
   this.setState({ showFiles: false, initialData: false, showShelf: false });
   this.sync(appData);
  }

  setTitle(id, title) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.file = appData.files.map(f => {
      if(f.id === id) {
        f.title = title;
      }
    });
    this.sync(appData);
  }

  deleteFile(fileName) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.files = appData.files.filter(file => file.id !== fileName);
    if(this.state.currentDoc === fileName) {
      if(appData.files.length) {
        appData.currentDoc = appData.files[0].id;
      } else {
        const id = shortid.generate();
        appData.currentDoc = id;
        appData.files.unshift({ id, title: false, lastModified: new Date() });
      }
    }
    this.sync(appData);
    this.syncUtils.find(fileName, docMetadata => {
      this.syncUtils.deleteFiles(docMetadata.pageIds).then(results => {
        this.syncUtils.deleteFile(fileName)
      })
    })
  }

  handleImport(e) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const appData = JSON.parse(localStorage.getItem('appData'));
      const id = shortid.generate();
      appData.currentDoc = id;
      appData.files.unshift({ id, title: false, lastModified: new Date() });
      this.setState({ initialData: e.target.result, showFiles: false, showShelf: false });
      this.sync(appData);
    }
    reader.readAsText(e.target.files[0]);
  }

  toggleArchive(id) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.file = appData.files.map(f => {
      if(f.id === id) {
        f.archived = !f.archived;
      }
    });
    this.setState({ newTitle: false, editTitle: false });
    this.sync(appData);
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
        const title = this.state.files.filter(f => f.id === this.state.currentDoc).title || 'Untitled';
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
      initialData={this.state.initialData}
      goToBlock={this.state.goToBlock}
      setDocData={(allLines, doc) => this.setState({ allLines, doc })} /> }
    <Shelf handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      gapi={this.props.gapi}
      tryItNow={this.props.tryItNow}
      showShelf={this.state.showShelf}
      setShelf={(val) => this.setState({ showShelf: val })}
      showFiles={(val) => this.setState({ showFiles: val, viewArchive: false })}
      showSearch={() => this.setState({ showSearch: true })}/>

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


    <div className={`m2-files modal ${this.state.showFiles && 'is-active'}`}>
    <div className="modal-background" onClick={() => this.setState({showFiles: false})}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">Files</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({showFiles: false})}></button>
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
            {this.state.files && this.state.files.filter(f => (!!f.archived == this.state.viewArchive)).map(f =>
              <tr key={f.id}>
                <td><div className="select">
                      <select value={''} onChange={(e) => this.takeFileAction(e, f)}>
                        <option value=""></option>
                        <option value="rename">Rename</option>
                        {f.id === this.state.currentDoc && <option value="export">Export</option>}
                        <option value="toggleArchive">{!f.archived ? 'Archive' : 'Move to files'}</option>
                        <option value="delete">Delete</option>
                      </select>
                    </div></td>
                  <td className={f.id === this.state.currentDoc && 'm2-is-current-doc'}>
    <a onClick={() => this.openFile(f.id)}>{f.title ? <abbr title={f.title}>{f.title.substring(0,20)}</abbr>: 'Untitled'}</a></td>
                <td>{moment(f.lastModified).fromNow()}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="m2-footer">
          <a onClick={() => this.setState({ viewArchive: !this.state.viewArchive })}>{this.state.viewArchive ? 'View files' : 'View archive'}</a>
        </div>
      </section>
    </div>
    </div></div>
  }
}

export default MarkTwo
