import React from 'react';
import './Page.scss'
import $ from 'jquery';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import _ from 'lodash';
import marked from 'marked';
import Shelf from './Shelf';
import shortid from 'shortid';
import stringify from 'json-stringify-deterministic';
import md5 from 'md5';

class Page extends React.Component {
  constructor(props) {
    super(props);

    this.sync = this.sync.bind(this);
    this.debouncedSync = _.debounce(this.sync, 5000);

    TurndownService.prototype.escape = text => text; // disable escaping characters
    this.turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    this.turndownService.use(gfm);
    marked.setOptions({
      breaks: true,
      smartLists: true,
    })

    this.documentId = localStorage.getItem('currentDoc');
    if(!this.documentId) {
      this.documentId = shortid.generate();
      localStorage.setItem('currentDoc', this.documentId);
    }

    this.state = {};
  }

  sync() {
    console.log('syncing');
    // get doc
    if(!localStorage.getItem('currentDoc')) {
      this.documentId = shortid.generate();
      localStorage.setItem('currentDoc', this.documentId);
    } else {
      this.documentId = localStorage.getItem('currentDoc');
    }

    let lines = [];
    $('#m2-page > *').each((i, el) => {
      if(!el.id) {
        el.id = shortid.generate();
        this.doc[el.id] = this.turndownService.turndown(el.outerHTML);
      }
      lines.push(el.id);
    })

    const sel = window.getSelection();
    let caretAt = $(sel.anchorNode).closest('#m2-page > *').attr('id');

    const oldDocMetadata = localStorage.getItem(this.documentId) ? JSON.parse(localStorage.getItem(this.documentId))
                            : { pageIds: [] };


    // creates the authoritative definition of the document, a list of ids with text,
    // and stores as blocks of data keyed by the hash of the data.
    const pages = {};
    const pageIds = []
    _.chunk(lines.map(id => ({ id, text: this.doc[id]})), 100).map(page => {
      const value = stringify(page);
      const hash = md5(value);
      const id = `${this.documentId}.${hash}`;
      pages[id] = value;
      pageIds.push(id);
    })

    // update doc meta data
    localStorage.setItem(this.documentId, JSON.stringify({ caretAt,
      version: (this.version || 0) + 1,
      pageIds,
      lastModified: new Date().toISOString() }));

    // update page caches
    // if the page isn't cached, cache it
    _.difference(pageIds, oldDocMetadata.pageIds).map(pageId => {
      localStorage.setItem(pageId, pages[pageId]);
    })

    // if the page has been removed, remove it
    _.difference(oldDocMetadata.pageIds, pageIds).map(pageId => {
       localStorage.removeItem(pageId);
    });
  }

  componentDidMount() {
    if(localStorage.getItem(this.documentId)) {
      const docMetadata = JSON.parse(localStorage.getItem(this.documentId));
      this.documentId = docMetadata.documentId;
      this.version = docMetadata.version;
      // assemble document
      const docList = _.flatten(docMetadata.pageIds.map(id => JSON.parse(localStorage.getItem(id))))

      document.querySelector('#m2-page').innerHTML = docList.map(entry => marked(entry.text || '\u200B')).join('\n')
      Array.from(document.querySelector('#m2-page').children).forEach((el, i) => {
        el.id = docList[i].id;
      });
      this.doc = {};
      docList.forEach(entry => this.doc[entry.id] = entry.text);
      document.getElementById(docMetadata.caretAt).scrollIntoView();
    } else {
      this.doc = {};
    }


    let selectedBlock;
    $('#m2-page').on('keyup keydown mouseup', (e) => {
      this.debouncedSync();

      let oldSelectedBlock;
      if(selectedBlock) {
        oldSelectedBlock = selectedBlock;
      }

      let sel = window.getSelection();
      console.log('selection:');
      console.log(sel);
      console.log('anchorNode:');
      console.log(sel.anchorNode);
      const originalAnchorText = (sel.anchorNode && sel.anchorNode.data) ? sel.anchorNode.data.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') : 0;
      selectedBlock = $(sel.anchorNode).closest('#m2-page > *');
      console.log('selectedBlock:');
      console.log(selectedBlock);

      if(e.key === 'Enter' && e.type === 'keydown') {
        e.preventDefault();

        // if the current line is not empty, prevent default and continue the string in a newline
        if(selectedBlock && selectedBlock[0] && !(sel.anchorNode.data === '\n\u200B' || (sel.anchorNode.tagName === 'BR'))) {
        console.log(e);

        let range;
        if(sel.getRangeAt && sel.rangeCount) {
            range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode('\n\u200B'));
            sel.anchorNode.nextSibling && sel.collapse(sel.anchorNode.nextSibling, sel.anchorNode.nextSibling.length);
        }
        } else {
          // if the line is empty, start a new paragraph
          const newBlock = $(`<p id=${shortid.generate()}><br /></p>`);
          newBlock.insertAfter(selectedBlock);
          sel.collapse(newBlock[0], 0);
        }
      }


      // enter edit mode, showing markdown
      console.log(selectedBlock.data('editMode'));
      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        console.log('markdown:');
        console.log(selectedBlock[0] && this.turndownService.turndown(selectedBlock[0].outerHTML));

        console.log('selection before toggling to edit');
        console.log(sel)
        const anchorOffset = sel.anchorOffset;
        let renderedMarkdown;
        if(selectedBlock.attr('id')) {
          renderedMarkdown = this.doc[selectedBlock.attr('id')] || '<br />';
        } else {
          renderedMarkdown = this.turndownService.turndown(selectedBlock[0].outerHTML) || '<br />'
        }
        selectedBlock.html(renderedMarkdown);
        console.log('selection after toggling to edit');
        console.log(sel)
        var range = document.createRange();
        let offset;
        if(selectedBlock[0].firstChild && selectedBlock[0].firstChild.data) {
          const stringMatch = selectedBlock[0].firstChild.data.match(new RegExp(originalAnchorText));
          const stringIndex = stringMatch ? stringMatch.index : 0;
          offset = stringIndex + anchorOffset;
        } else {
          offset = 0;
        }
        range.setStart(selectedBlock[0].firstChild, Math.min(offset, selectedBlock[0].firstChild.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        selectedBlock.data('editMode', true);
        selectedBlock.css('white-space', 'pre');
        //selectedBlock.css('background-color', '#fafafa');
      }

      // render the old node upon exit
      if(oldSelectedBlock && oldSelectedBlock[0] && selectedBlock && selectedBlock[0] && !oldSelectedBlock[0].isSameNode(selectedBlock[0])) {
        console.log('rendered markdown:')
        let markdown = oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        console.log(markdown);
        console.log('html:');
        let html = marked(markdown);
        console.log(html);
        const renderedNode = $(html.replace(/\\/g, '') || '<p><br /></p>');
        let id = oldSelectedBlock.attr('id');
        if(!id) {
          id = shortid.generate();
        }
        renderedNode.attr('id', id);
        this.doc[id] = markdown.trim();
        console.log(this.doc);
        oldSelectedBlock.replaceWith(renderedNode);
      }

      // fixes bug with contenteditable where you completely empty the p if the document is empty
      if (e.key === 'Backspace' || e.key === 'Delete') {
          if(!document.querySelector('#m2-page > *')) {
            document.querySelector('#m2-page').innerHTML = `<p id="${shortid.generate()}"><br /></p>`;
          }
      }
    });

    //this.sync();
  }

  render() {
    return <div><div id="m2-page" className="m2-page content" contentEditable="true" dangerouslySetInnerHTML={ {__html: '<p><br /></p>'} }></div>
    <Shelf handleLogout={this.props.handleLogout} handleSwitchUser={this.props.handleSwitchUser} gapi={this.props.gapi} tryItNow={this.props.tryItNow} />
  </div>
  }
}

export default Page;
