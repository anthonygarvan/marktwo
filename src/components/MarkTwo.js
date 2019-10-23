import React from 'react';
import moment from 'moment';
import Shelf from './Shelf';
import shortid from 'shortid';
import Doc from './Doc';
import './MarkTwo.scss';
import marked from 'marked';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import syncUtils from './syncUtils';
import { faEdit, faCheck, faTimes, faTrash, faTrashRestore } from '@fortawesome/free-solid-svg-icons';

class MarkTwo extends React.Component {
  constructor(props) {
    super(props);

    this.openFile = this.openFile.bind(this);
    this.startNewFile = this.startNewFile.bind(this);
    this.handleImport = this.handleImport.bind(this);
    this.toggleTrash = this.toggleTrash.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
    this.sync = this.sync.bind(this);

    marked.setOptions({
      breaks: true,
      smartLists: true,
    });

    this.state = {
      newTitle: false,
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
        f.title = this.state.newTitle;
      }
    });
    this.setState({ newTitle: false, editTitle: false });
    this.sync(appData);
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

  toggleTrash(id) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.file = appData.files.map(f => {
      if(f.id === id) {
        f.trashed = !f.trashed;
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
      showFiles={(val) => this.setState({ showFiles: val, viewTrash: false })}
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
              <th><abbr title="File name">Name</abbr></th>
              <th><abbr title="Last modified">Last modified</abbr></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {this.state.files && this.state.files.filter(f => (!!f.trashed == this.state.viewTrash)).map(f =>
              <tr key={f.id}>
                <td>{this.state.editTitle !== f.id ? <span><a onClick={() => this.openFile(f.id)}>{f.title ? <abbr title={f.title}>{f.title.substring(0,20)}</abbr>: 'Untitled'}</a>
                <a className="is-pulled-right" onClick={() => this.setState({ editTitle: f.id, newTitle: f.title })}> <FontAwesomeIcon icon={faEdit} /></a></span>
                : <span><input value={this.state.newTitle || ''} placeholder="Untitled" onChange={(e) => this.setState({ newTitle: e.target.value })}/>
                <span className="is-pulled-right"><a onClick={() => this.setTitle(f.id)}><FontAwesomeIcon icon={faCheck} /></a> &nbsp;&nbsp;
                <a onClick={() => this.setState({ editTitle: false, newTitle: false })}><FontAwesomeIcon icon={faTimes} /></a></span></span>}
                </td>
                <td>{moment(f.lastModified).fromNow()}</td>
                <td><a onClick={() => this.toggleTrash(f.id)}><FontAwesomeIcon icon={this.state.viewTrash ? faTrashRestore : faTrash} /></a></td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="m2-footer">
          <a onClick={() => this.setState({ viewTrash: !this.state.viewTrash })}>{this.state.viewTrash ? 'View files' : 'View trash'}</a>
        </div>
      </section>
    </div>
    </div></div>
  }
}

export default MarkTwo
