using System;
using System.ComponentModel.Composition;
using McTools.Xrm.Connection;
using XrmToolBox.Extensibility;
using XrmToolBox.Extensibility.Interfaces;

namespace FunctionalLocationMerge
{
    /// <summary>
    /// XrmToolBox plugin registration. The actual UI lives in <see cref="MergeControl"/>.
    /// XrmToolBox finds this via MEF (the [Export] attributes) when the dll is dropped
    /// into the Plugins folder.
    /// </summary>
    [Export(typeof(IXrmToolBoxPlugin))]
    [ExportMetadata("Name", "Functional Location De-duplicator")]
    [ExportMetadata("Description", "Merge duplicate Functional Locations onto a master record.")]
    [ExportMetadata("Author", "Mark Christie")]
    [ExportMetadata("BackgroundColor", "DarkSlateGray")]
    [ExportMetadata("PrimaryFontColor", "White")]
    [ExportMetadata("SecondaryFontColor", "WhiteSmoke")]
    [ExportMetadata("SmallImageBase64", IconData.Small)]
    [ExportMetadata("BigImageBase64", IconData.Big)]
    public class FunctionalLocationMergePlugin : PluginBase
    {
        public override IXrmToolBoxPluginControl GetControl()
        {
            return new MergeControl();
        }
    }
}
