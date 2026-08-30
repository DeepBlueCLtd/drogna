// A fixture for check-view-ids: three ways to name a view that is not declared.
export const written = <a href="#/view/system">the System tab</a>;
export const built = hashForView('gone');
export const fine = <a href="#/view/holdings">the Holdings tab</a>;
// harness:allow-view-id prose about a withdrawn address is the record of why it went
export const recorded = 'the address #/view/system was retired and not redirected';
