import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Routes,
} from '@angular/router';
import { EditorPage } from './editor/editor.page';
import { inject } from '@angular/core';
import { EditorDocumentService } from './services/editor-document.service';

export const editorResolver = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  return inject(EditorDocumentService).loadProjectFromLocalStorage();
};

export const routes: Routes = [
  { path: '', resolve: [editorResolver], component: EditorPage },
];
